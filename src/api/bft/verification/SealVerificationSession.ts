import { ISealAuthenticator } from './ISealAuthenticator.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicitySealTrustBaseEntryRule } from './rule/UnicitySealTrustBaseEntryRule.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { authorityIdentity } from '../../../internal/bft/authorityIdentity.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../util/HexConverter.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { NetworkId } from '../../NetworkId.js';
import { SdkError } from '../../SdkError.js';
import { ITrustBaseHistory } from '../trustbase/ITrustBaseHistory.js';
import { RootTrustBaseV2 } from '../trustbase/RootTrustBaseV2.js';
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
 * The authority is a trust-base history: each seal is checked against the entry of its own epoch. The memo key commits
 * to the length-delimited complete seal encoding (signatures included, so altered signature witnesses cannot hit an
 * entry), the complete encoding of that entry (network, epoch, start round, members, weights, quorum) and the verifier
 * policy id. Network, epoch and round of the seal are always placed in the history, independently of the memo.
 *
 * The session owns exactly one quorum rule (and so one signature verifier); it is not shared between workers or
 * operations and no verified flag can be supplied from outside.
 */
export class SealVerificationSession implements ISealAuthenticator {
  /** Minimum seal timestamp: Thursday, April 20, 2023 6:11:24 AM GMT+00:00. */
  public static readonly GENESIS_TIME = 1681971084n;

  private readonly authorityIds = new Map<RootTrustBaseV2, string>();
  private readonly completed = new Map<string, VerificationResult<VerificationStatus>>();
  private readonly counters = { inFlightJoins: 0, memoHits: 0, quorumChecks: 0 };
  private readonly customRule: boolean;
  private readonly history: ITrustBaseHistory;
  private readonly inFlight = new Map<string, Promise<VerificationResult<VerificationStatus>>>();
  private readonly policy: string;

  /**
   * @param {ITrustBaseHistory} history Trusted authority the seals are authenticated against: the held trust-base history.
   * @param {UnicitySealQuorumSignaturesVerificationRule} quorumRule Quorum rule, runs on every distinct miss.
   * @param {object} [options] Options.
   * @param {number} [options.maxEntries] Upper bound on retained successful checks, the oldest is evicted first.
   * @param {number} [options.maxInFlight] Upper bound on distinct checks running at once, further ones throw.
   * @param {string} [options.policy] Identifier of the verifier policy, part of the memo key.
   * @throws {Error} If `maxEntries` is not a positive integer.
   */
  public constructor(
    history: ITrustBaseHistory,
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
    // Entries are immutable and the history only grows, so a verdict and its memo key cannot disagree; each entry's identity is built once
    this.history = history;
    // a customized rule is not wrapped: it is asked about the entry itself and its verdicts are never remembered
    this.customRule = Object.getPrototypeOf(quorumRule) !== UnicitySealQuorumSignaturesVerificationRule.prototype;
    this.policy = options.policy ?? '';
  }

  /**
   * @returns {number} Number of distinct entries whose identity this session built (once each).
   */
  public get authorityBuilds(): number {
    return this.authorityIds.size;
  }

  /**
   * @returns {string} Identity of the anchored authority (the genesis pin and the held tip) and the verifier policy. It changes when the
   *   history grows, which only costs a cache miss.
   */
  public get identity(): string {
    const tip = this.history.tip;
    return JSON.stringify([
      this.policy,
      HexConverter.encode(this.history.genesisPin),
      tip === null ? null : HexConverter.encode(tip.encode()),
    ]);
  }

  /**
   * @returns {ITrustBaseHistory} The trust-base history this session was created for.
   */
  public get sourceTrustBase(): ITrustBaseHistory {
    return this.history;
  }

  /**
   * @returns {ISealVerificationSessionStats} Snapshot of the counters.
   */
  public get stats(): ISealVerificationSessionStats {
    return { ...this.counters };
  }

  /**
   * @returns {NetworkId|null} Network of the trusted authority, or null while the history is empty.
   */
  public get trustBaseNetwork(): NetworkId | null {
    return this.history.networkId;
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
    if (signatures.size > UnicitySeal.MAX_WITNESSES) {
      return `Seal has ${signatures.size} signatures, more than ${UnicitySeal.MAX_WITNESSES}.`;
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
   * Authenticate the seal: structure, then its place in the history (network, the entry of its epoch, the round inside that epoch), then the
   * quorum signatures of that entry, once per distinct seal. A seal of an epoch the history does not hold fails with the typed no-entry result.
   *
   * @param {UnicitySeal} seal Seal.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Outcome.
   */
  public authenticate(seal: UnicitySeal): Promise<VerificationResult<VerificationStatus>> {
    const structure = SealVerificationSession.checkSealStructure(seal);
    if (structure !== null) {
      return Promise.resolve(new VerificationResult('SealAuthority', VerificationStatus.FAIL, structure));
    }
    const placed = UnicitySealTrustBaseEntryRule.verify(this.history, seal);
    if (placed.entry === null) {
      return Promise.resolve(
        new VerificationResult('SealAuthority', VerificationStatus.FAIL, placed.message, [placed]),
      );
    }

    return this.verifyQuorum(placed.entry, seal);
  }

  /**
   * Quorum signatures of the seal against a given entry of the session's history (the caller placed the seal in it), memoized and in-flight
   * deduplicated per distinct (policy, entry, seal).
   *
   * @internal
   * @param {RootTrustBaseV2} entry Entry of the seal's epoch.
   * @param {UnicitySeal} seal Seal.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Outcome.
   */
  public async verifyQuorum(
    entry: RootTrustBaseV2,
    seal: UnicitySeal,
  ): Promise<VerificationResult<VerificationStatus>> {
    // Before the memo key is built (which encodes and hashes the whole seal) and before any signature work.
    if ((seal.witnesses?.size ?? 0) > UnicitySeal.MAX_WITNESSES) {
      return new VerificationResult(
        'SealAuthority',
        VerificationStatus.FAIL,
        `Seal has ${seal.witnesses?.size} signatures, more than ${UnicitySeal.MAX_WITNESSES}.`,
      );
    }
    if (this.customRule) {
      this.counters.quorumChecks++;
      return this.quorumRule.verify(entry, seal);
    }
    const key = await this.keyFor(entry, seal);
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
    const check = this.quorumRule.verify(entry, seal).then(
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

  private async keyFor(entry: RootTrustBaseV2, seal: UnicitySeal): Promise<string> {
    let authorityId = this.authorityIds.get(entry);
    if (authorityId === undefined) {
      authorityId = authorityIdentity(entry);
      this.authorityIds.set(entry, authorityId);
    }
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeTextString(JSON.stringify([this.policy, authorityId])),
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
