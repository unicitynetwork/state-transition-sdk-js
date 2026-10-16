import { ISealAuthenticator } from './ISealAuthenticator.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { authorityIdentity } from '../../../internal/bft/authorityIdentity.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../util/HexConverter.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { NetworkId } from '../../NetworkId.js';
import { SdkError } from '../../SdkError.js';
import { RootTrustBase } from '../RootTrustBase.js';
import { UnicitySeal } from '../UnicitySeal.js';

/**
 * The session has as many distinct seal checks running as it allows. A resource limit of the operation, not a
 * verification result: nothing about the seal is known. Retry later or verify with a larger `maxInFlight`.
 */
export class SealVerificationBusyError extends SdkError<'SealVerificationBusyError'> {
  public override readonly name = 'SealVerificationBusyError' as const;

  /**
   * @param {number} maxInFlight The session's bound.
   */
  public constructor(public readonly maxInFlight: number) {
    super(`Too many concurrent seal verifications in the session (limit ${maxInFlight}).`);
  }
}

/**
 * Counters of a {@link SealVerificationSession}.
 */
export interface ISealVerificationSessionStats {
  /** Requests that joined a check already in flight. */
  readonly inFlightJoins: number;
  /** Requests served from a completed successful check. */
  readonly memoHits: number;
  /** Distinct quorum signature verifications executed (cache and in-flight misses). */
  readonly quorumChecks: number;
}

/**
 * Seal authentication scoped to one operation (e.g. verification of one token or one consolidation attempt).
 *
 * Every shard certificate and transaction proof of a consolidated token carries the same master seal, so each leaf
 * check would repeat the same quorum signature work. The session authenticates a complete seal once per
 * (policy, authority, seal) and serves repeats from a bounded memo of *successes*; checks that are still running are
 * shared too, so concurrent leaf checks do not all miss and each repeat the signatures. Failures are never memoized
 * and a failed or throwing check is dropped from the in-flight set.
 *
 * The memo key commits to the length-delimited complete seal encoding (signatures included, so altered signature
 * witnesses cannot hit an entry), the trust base content (network, epoch, nodes, quorum) and the verifier policy id.
 * Network, epoch and epoch start of the seal are always checked against the trust base, independently of the memo.
 *
 * The session owns exactly one quorum rule (and so one signature verifier); it is not shared between workers or
 * operations and no verified flag can be supplied from outside.
 */
export class SealVerificationSession implements ISealAuthenticator {
  /** Minimum seal timestamp: Thursday, April 20, 2023 6:11:24 AM GMT+00:00. */
  public static readonly GENESIS_TIME = 1681971084n;

  private readonly authorityId: string;
  private readonly completed = new Map<string, VerificationResult<VerificationStatus>>();
  private readonly counters = { inFlightJoins: 0, memoHits: 0, quorumChecks: 0 };
  private readonly customRule: boolean;
  private readonly identityText: string;
  private readonly inFlight = new Map<string, Promise<VerificationResult<VerificationStatus>>>();
  private readonly source: RootTrustBase;
  private readonly trustBase: RootTrustBase;

  /**
   * @param {RootTrustBase} trustBase Trusted authority the seals are authenticated against.
   * @param {UnicitySealQuorumSignaturesVerificationRule} quorumRule Quorum rule, runs on every distinct miss.
   * @param {object} [options] Options.
   * @param {number} [options.maxEntries] Upper bound on retained successful checks, the oldest is evicted first.
   * @param {number} [options.maxInFlight] Upper bound on distinct checks running at once, further ones throw.
   * @param {string} [options.policy] Identifier of the verifier policy, part of the memo key.
   * @throws {Error} If `maxEntries` is not a positive integer.
   */
  public constructor(
    trustBase: RootTrustBase,
    private readonly quorumRule: UnicitySealQuorumSignaturesVerificationRule,
    private readonly options: {
      readonly maxEntries?: number;
      readonly maxInFlight?: number;
      readonly policy?: string;
    } = {},
  ) {
    const maxEntries = options.maxEntries ?? 64;
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError('SealVerificationSession maxEntries must be a positive integer');
    }
    const maxInFlight = options.maxInFlight ?? 64;
    if (!Number.isInteger(maxInFlight) || maxInFlight <= 0) {
      throw new RangeError('SealVerificationSession maxInFlight must be a positive integer');
    }
    // The operation's authority is snapshotted once: every check of this session verifies against the snapshot and
    // every memo key commits to its identity, which is computed exactly once. Later changes to the caller's object
    // cannot make the verdicts and the keys disagree, and a new operation sees the new state.
    this.source = trustBase;
    this.trustBase = trustBase.snapshot();
    // a customized rule is not wrapped: it is asked about the caller's own object and its verdicts are never remembered
    this.customRule = Object.getPrototypeOf(quorumRule) !== UnicitySealQuorumSignaturesVerificationRule.prototype;
    this.authorityId = authorityIdentity(this.trustBase);
    this.identityText = JSON.stringify([options.policy ?? '', this.authorityId]);
  }

  /**
   * @returns {string} Identity of the anchored authority and the verifier policy.
   */
  public get identity(): string {
    return this.identityText;
  }

  /**
   * @returns {RootTrustBase} The trust base object this session was created for (its authority is a snapshot).
   */
  public get sourceTrustBase(): RootTrustBase {
    return this.source;
  }

  /**
   * @returns {ISealVerificationSessionStats} Snapshot of the counters.
   */
  public get stats(): ISealVerificationSessionStats {
    return { ...this.counters };
  }

  /**
   * @returns {NetworkId} Network of the trusted authority.
   */
  public get trustBaseNetwork(): NetworkId {
    return this.trustBase.networkId;
  }

  /**
   * Check the seal belongs to the authority the trust base represents: structure, network, epoch and epoch start.
   * Quorum signatures are NOT checked.
   *
   * @param {RootTrustBase} trustBase Trusted authority.
   * @param {UnicitySeal} seal Seal.
   * @returns {string|null} Failure description or null if the seal is within the authority.
   */
  public static checkAuthority(trustBase: RootTrustBase, seal: UnicitySeal): string | null {
    const structure = SealVerificationSession.checkSealStructure(seal);
    if (structure !== null) {
      return structure;
    }
    if (!seal.networkId.equals(trustBase.networkId)) {
      return `Seal is of network ${seal.networkId.id}, trust base is of network ${trustBase.networkId.id}.`;
    }
    if (seal.epoch !== trustBase.epoch) {
      return `Seal is of epoch ${seal.epoch}, trust base is of epoch ${trustBase.epoch}.`;
    }
    if (seal.rootChainRoundNumber < trustBase.epochStartRound) {
      return `Seal round ${seal.rootChainRoundNumber} is before the start of epoch ${trustBase.epoch} (round ${trustBase.epochStartRound}).`;
    }
    return null;
  }

  /**
   * Native seal structural validation (bft-go-base `UnicitySeal.IsValid`): hash present, root round at least 1,
   * timestamp not before the genesis time, signatures present with a signer id and bytes each. Independent of any
   * trust base; signer map entries are outside the signed payload, so this must hold before a success is returned or
   * remembered.
   *
   * @param {UnicitySeal} seal Seal.
   * @returns {string|null} Failure description or null if the seal is structurally valid.
   */
  public static checkSealStructure(seal: UnicitySeal): string | null {
    if (!seal.hash.length) {
      return 'Seal hash is missing.';
    }
    if (seal.rootChainRoundNumber < 1n) {
      return 'Seal root chain round is invalid.';
    }
    if (seal.timestamp < SealVerificationSession.GENESIS_TIME) {
      return 'Seal timestamp is invalid.';
    }
    const signatures = seal.witnesses;
    if (!signatures?.size) {
      return 'Seal has no signatures.';
    }
    for (const [signer, signature] of signatures) {
      if (signer === '') {
        return 'Seal has a signature without signer ID.';
      }
      if (signature.length === 0) {
        return `Seal has an empty signature for "${signer}".`;
      }
    }
    return null;
  }

  /**
   * Authenticate the seal: authority context first, then the quorum signatures, once per distinct seal.
   *
   * @param {UnicitySeal} seal Seal.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Outcome.
   */
  public authenticate(seal: UnicitySeal): Promise<VerificationResult<VerificationStatus>> {
    const failure = SealVerificationSession.checkAuthority(this.trustBase, seal);
    if (failure !== null) {
      return Promise.resolve(new VerificationResult('SealAuthority', VerificationStatus.FAIL, failure));
    }

    return this.verifyQuorumSignaturesOnly(seal);
  }

  /**
   * **Weaker than {@link SealVerificationSession.authenticate}; use that one.** Checks only the quorum signatures of
   * the seal against the session's trust base: no structure, network, epoch or epoch start checks. Ordinary token
   * verification needs exactly this, because it has always accepted original proofs' seals on signatures alone
   * (including seals of earlier epochs and fixtures without a timestamp). Results are memoized and in-flight
   * deduplicated like `authenticate`'s, in a memo shared with it, so a distinct complete seal is checked once.
   * The structure check is deliberately not applied here, as it would reject seals the SDK has always accepted; the
   * shared memo is still safe because `authenticate` runs its structure and authority checks before every memo lookup,
   * so a quorum-only success can never admit a seal through the strict path.
   *
   * @internal
   * @param {UnicitySeal} seal Seal.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Outcome.
   */
  public async verifyQuorumSignaturesOnly(seal: UnicitySeal): Promise<VerificationResult<VerificationStatus>> {
    if (this.customRule) {
      this.counters.quorumChecks++;
      return this.quorumRule.verify(this.source, seal);
    }
    const key = await this.keyFor(seal);
    const done = this.completed.get(key);
    if (done) {
      this.counters.memoHits++;
      return done;
    }
    const running = this.inFlight.get(key);
    if (running) {
      this.counters.inFlightJoins++;
      return running;
    }

    if (this.inFlight.size >= (this.options.maxInFlight ?? 64)) {
      throw new SealVerificationBusyError(this.options.maxInFlight ?? 64);
    }

    this.counters.quorumChecks++;
    const check = this.quorumRule.verify(this.trustBase, seal).then(
      (result) => {
        this.inFlight.delete(key);
        if (result.status === VerificationStatus.OK) {
          this.remember(key, result);
        }
        return result;
      },
      (error: unknown) => {
        this.inFlight.delete(key);
        throw error;
      },
    );
    this.inFlight.set(key, check);
    return check;
  }

  private async keyFor(seal: UnicitySeal): Promise<string> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeTextString(this.identity),
          CborSerializer.encodeByteString(seal.toCBOR()),
        ),
      )
      .digest();
    return HexConverter.encode(hash.imprint);
  }

  private remember(key: string, result: VerificationResult<VerificationStatus>): void {
    if (this.completed.size >= (this.options.maxEntries ?? 64)) {
      const oldest = this.completed.keys().next();
      if (!oldest.done) {
        this.completed.delete(oldest.value);
      }
    }
    this.completed.set(key, result);
  }
}
