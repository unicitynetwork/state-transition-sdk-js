import { UnicitySealHashMatchesWithRootHashRule } from './rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from './SealVerificationSession.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../util/HexConverter.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { InclusionProof } from '../../InclusionProof.js';
import { RootTrustBase } from '../RootTrustBase.js';
import { UnicityCertificate } from '../UnicityCertificate.js';

const OPERATION_CAPABILITY = Symbol('beginOperation');

/**
 * Result of a {@link UnicityCertificateVerifier} run.
 */
class UnicityCertificateVerificationResult extends VerificationResult<VerificationStatus> {
  private constructor(status: VerificationStatus, results: VerificationResult<unknown>[]) {
    super('UnicityCertificateVerification', status, '', results);
  }

  /**
   * Build a failed verification result.
   *
   * @param {VerificationResult<unknown>[]} results Child rule results.
   * @returns {UnicityCertificateVerificationResult} Failed result.
   */
  public static fail(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.FAIL, results);
  }

  /**
   * Build a successful verification result.
   *
   * @param {VerificationResult<unknown>[]} results Child rule results.
   * @returns {UnicityCertificateVerificationResult} Successful result.
   */
  public static ok(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.OK, results);
  }
}

/**
 * Unicity certificate verification.
 *
 * Composed from the quorum-signature rule, which carries the signature verifier
 * and any seal memo, so callers pass this domain-level verifier around rather
 * than a bare signature verifier that says nothing about what it verifies:
 *
 * ```ts
 * new UnicityCertificateVerifier(
 *   new UnicitySealQuorumSignaturesVerificationRule(
 *     new Secp256k1SignatureVerifier(),
 *     new VerifiedSealCache(256), // omit to verify every seal afresh
 *   ),
 * );
 * ```
 */
export class UnicityCertificateVerifier {
  /**
   * @param {UnicitySealQuorumSignaturesVerificationRule} quorumSignaturesRule Seal quorum-signature rule.
   */
  public constructor(protected readonly quorumSignaturesRule: UnicitySealQuorumSignaturesVerificationRule) {}

  /**
   * @returns {UnicitySealQuorumSignaturesVerificationRule} The quorum rule this verifier applies, with its signature
   *   verifier and cache: whoever shares seal work with this verifier must do it through this rule.
   */
  public get quorumRule(): UnicitySealQuorumSignaturesVerificationRule {
    return this.quorumSignaturesRule;
  }

  /**
   * Begin one verification operation (e.g. one token with every nested token).
   *
   * Returns a verifier with the same rules whose repeated work is shared for the operation only: a distinct complete
   * unicity certificate has its shard and partition path to the seal hash evaluated once, a distinct complete seal has
   * its quorum signatures checked once (concurrent checks share the running one), and the authority identity is built
   * once. Per-input rules (leaf data, reference time, predicates, paths to the state root) are not shared. Memo keys
   * commit to the complete certificate or seal bytes and the operation's authority snapshot, only successes are kept,
   * and the state is bounded and discarded with the returned object.
   *
   * A subclass that customizes verification, or a verifier built with a customized quorum rule, returns itself: injected
   * verifiers and rules keep full control.
   *
   * @param {SealVerificationSession} [session] Session to adopt for its trust base, so that a caller that already
   *   authenticated a seal strictly in the same operation does not pay the quorum check twice.
   * @returns {UnicityCertificateVerifier} Operation scoped verifier.
   */
  public beginOperation(session?: SealVerificationSession): UnicityCertificateVerifier {
    // neither a customized verifier nor a customized quorum rule is wrapped: the operation memoizes and hands the rule a
    // snapshot of the trust base, which only a rule that is pure in (authority content, seal bytes) can rely on
    if (
      Object.getPrototypeOf(this) !== UnicityCertificateVerifier.prototype ||
      Object.getPrototypeOf(this.quorumSignaturesRule) !== UnicitySealQuorumSignaturesVerificationRule.prototype
    ) {
      return this;
    }
    return new OperationUnicityCertificateVerifier(OPERATION_CAPABILITY, this.quorumSignaturesRule, session);
  }

  /**
   * Verify the unicity certificate in an inclusion proof against the trust base.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {InclusionProof} inclusionProof Inclusion proof carrying the unicity certificate.
   * @returns {Promise<UnicityCertificateVerificationResult>} Verification outcome.
   */
  public async verify(
    trustBase: RootTrustBase,
    inclusionProof: InclusionProof,
  ): Promise<UnicityCertificateVerificationResult> {
    const results: VerificationResult<VerificationStatus>[] = [];

    if (!inclusionProof.unicityCertificate.unicitySeal.networkId.equals(trustBase.networkId)) {
      results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.FAIL));
      return UnicityCertificateVerificationResult.fail(results);
    }
    results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.OK));

    let result = await UnicitySealHashMatchesWithRootHashRule.verify(inclusionProof.unicityCertificate);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    result = await this.quorumSignaturesRule.verify(trustBase, inclusionProof.unicityCertificate.unicitySeal);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    return UnicityCertificateVerificationResult.ok(results);
  }
}

/**
 * Hardware-independent work counters of an operation scoped verifier.
 */
export interface IOperationVerificationStats {
  /** Authority identities built (once per trust base of the operation, never per proof). */
  readonly authorityBuilds: number;
  /** Shard and partition path evaluations to the seal hash actually executed (distinct complete certificates). */
  readonly bodyChecks: number;
  /** Body results served from the memo or a running check. */
  readonly bodyHits: number;
  /** Certificate encodings made to key the memo (one per verified proof). */
  readonly encodes: number;
  /** Quorum signature verifications actually executed (distinct complete seals per trust base). */
  readonly quorumChecks: number;
}

/**
 * {@link UnicityCertificateVerifier} for one operation, see {@link UnicityCertificateVerifier.beginOperation}.
 */
export class OperationUnicityCertificateVerifier extends UnicityCertificateVerifier {
  private static readonly MAX_BODIES = 256;

  private readonly bodies = new Map<string, VerificationResult<VerificationStatus>>();
  private readonly counters = { bodyChecks: 0, bodyHits: 0, encodes: 0 };
  private readonly inFlight = new Map<string, Promise<VerificationResult<VerificationStatus>>>();
  private readonly sessions = new Map<RootTrustBase, SealVerificationSession>();

  /**
   * Not constructible by applications: obtain it with {@link UnicityCertificateVerifier.beginOperation}, so that an
   * operation always starts from the caller's own verifier and rule.
   *
   * @param {symbol} capability Module private capability.
   * @param {UnicitySealQuorumSignaturesVerificationRule} rule Quorum rule of the verifier this operation began from.
   * @param {SealVerificationSession} [session] Session to adopt for its trust base.
   */
  public constructor(
    capability: symbol,
    rule: UnicitySealQuorumSignaturesVerificationRule,
    session?: SealVerificationSession,
  ) {
    super(rule);
    if (capability !== OPERATION_CAPABILITY) {
      throw new TypeError('An operation verifier is obtained with UnicityCertificateVerifier.beginOperation().');
    }
    if (session) {
      this.sessions.set(session.sourceTrustBase, session);
    }
  }

  /**
   * @returns {IOperationVerificationStats} Snapshot of the work counters.
   */
  public get stats(): IOperationVerificationStats {
    let authorityBuilds = 0;
    let quorumChecks = 0;
    for (const session of this.sessions.values()) {
      authorityBuilds++;
      quorumChecks += session.stats.quorumChecks;
    }
    return { ...this.counters, authorityBuilds, quorumChecks };
  }

  /**
   * @inheritDoc
   */
  public override beginOperation(): OperationUnicityCertificateVerifier {
    return this;
  }

  /**
   * @inheritDoc
   */
  public override async verify(
    trustBase: RootTrustBase,
    inclusionProof: InclusionProof,
  ): Promise<UnicityCertificateVerificationResult> {
    const results: VerificationResult<VerificationStatus>[] = [];
    const certificate = inclusionProof.unicityCertificate;

    if (!certificate.unicitySeal.networkId.equals(trustBase.networkId)) {
      results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.FAIL));
      return UnicityCertificateVerificationResult.fail(results);
    }
    results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.OK));

    let result = await this.body(certificate);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    result = await this.session(trustBase).verifyQuorumSignaturesOnly(certificate.unicitySeal);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    return UnicityCertificateVerificationResult.ok(results);
  }

  private async body(certificate: UnicityCertificate): Promise<VerificationResult<VerificationStatus>> {
    this.counters.encodes++;
    const key = HexConverter.encode(
      (
        await new DataHasher(HashAlgorithm.SHA256)
          .update(CborSerializer.encodeByteString(certificate.toCBOR()))
          .digest()
      ).imprint,
    );
    const done = this.bodies.get(key);
    if (done) {
      this.counters.bodyHits++;
      return done;
    }
    const running = this.inFlight.get(key);
    if (running) {
      this.counters.bodyHits++;
      return running;
    }

    this.counters.bodyChecks++;
    const check = UnicitySealHashMatchesWithRootHashRule.verify(certificate).then(
      (result) => {
        this.inFlight.delete(key);
        if (result.status === VerificationStatus.OK) {
          if (this.bodies.size >= OperationUnicityCertificateVerifier.MAX_BODIES) {
            const oldest = this.bodies.keys().next();
            if (!oldest.done) {
              this.bodies.delete(oldest.value);
            }
          }
          this.bodies.set(key, result);
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

  private session(trustBase: RootTrustBase): SealVerificationSession {
    let session = this.sessions.get(trustBase);
    if (!session) {
      session = new SealVerificationSession(trustBase, this.quorumSignaturesRule);
      this.sessions.set(trustBase, session);
    }
    return session;
  }
}
