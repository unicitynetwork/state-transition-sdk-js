import { UnicitySealHashMatchesWithRootHashRule } from './bft/verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { SealVerificationSession } from './bft/verification/SealVerificationSession.js';
import { OperationUnicityCertificateVerifier } from './bft/verification/UnicityCertificateVerifier.js';
import { NonInclusionProof } from './NonInclusionProof.js';
import { StateId } from './StateId.js';
import { IVerificationContext } from '../transaction/verification/IVerificationContext.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

const CAPABILITY = Symbol('VerifiedAbsence');

/**
 * Absence of one state **at one certified snapshot**: the state was not in the state tree the authenticated unicity
 * certificate commits to, at that root-chain round. That is a historical fact. It does not say the state is absent now,
 * that it was never certified, or that it can be spent (a state may be certified a moment later).
 *
 * Only obtainable from {@link verifyNonInclusion}; it cannot be constructed, forged or mutated.
 */
export class VerifiedAbsence {
  readonly #root: Uint8Array | null;

  /**
   * @internal
   * @param {symbol} capability Module private capability, not available outside this module.
   * @param {StateId} stateId The state.
   * @param {bigint} absentAtRound Root-chain round of the authenticated seal.
   * @param {Uint8Array|null} root State root of the snapshot, null for the certified empty tree.
   */
  public constructor(
    capability: symbol,
    public readonly stateId: StateId,
    public readonly absentAtRound: bigint,
    root: Uint8Array | null,
  ) {
    if (capability !== CAPABILITY) {
      throw new TypeError('A VerifiedAbsence is only obtained from verifyNonInclusion().');
    }
    this.#root = root ? new Uint8Array(root) : null;
    Object.freeze(this);
  }

  /**
   * @returns {boolean} Whether the snapshot was the certified empty tree.
   */
  public get emptyTree(): boolean {
    return this.#root === null;
  }

  /**
   * @returns {Uint8Array|null} Copy of the state root of the snapshot, null for the certified empty tree.
   */
  public get stateRoot(): Uint8Array | null {
    return this.#root ? new Uint8Array(this.#root) : null;
  }
}

/**
 * Why a proof did not establish absence, from the first check that failed, in this order: the certificate is not
 * valid for the expected partition (`uc_invalid`), its seal is not from the trusted authority (`authority_rejected`),
 * the snapshot is older than the caller requires (`stale`), the path does not reach the root (`certificate_invalid`),
 * or the authenticated leaf is the queried state (`state_included`).
 */
export type NonInclusionRejection =
  'authority_rejected' | 'certificate_invalid' | 'stale' | 'state_included' | 'uc_invalid';

/**
 * Explicit context of {@link verifyNonInclusion}: what the application expects, never taken from the proof.
 */
export interface INonInclusionVerificationOptions {
  /** Partition the application expects (the caller's intent). */
  readonly expectedPartition: bigint;
  /** Minimum root-chain round the application accepts. An authenticated older snapshot is `stale`, never absent. */
  readonly minRound?: bigint;
  /**
   * Authenticated start of the next epoch, if the authority history ends the verified one: a seal at or after it is
   * rejected. Must come from an authenticated history, never from the proof.
   */
  readonly nextEpochStartRound?: bigint;
  /**
   * Overrides the seal session. Not needed with an operation scoped context: if `unicityCertificateVerifier` came from
   * `beginOperation()`, its session is used and seals shared with inclusion proofs are checked once. Must be anchored to
   * the context's trust base.
   */
  readonly session?: SealVerificationSession;
  /** Pinned shard configuration hash of the (unsharded) partition. */
  readonly shardConfigurationHash?: Uint8Array;
}

/**
 * Result of {@link verifyNonInclusion}: narrow on `status`.
 */
export type NonInclusionVerification = VerificationResult<VerificationStatus> &
  (
    | { readonly absence: VerifiedAbsence; readonly status: VerificationStatus.OK; readonly verdict: 'absent' }
    | { readonly absence: null; readonly status: VerificationStatus.FAIL; readonly verdict: NonInclusionRejection }
  );

class VerificationOutcome extends VerificationResult<VerificationStatus> {
  public constructor(
    status: VerificationStatus,
    public readonly verdict: NonInclusionRejection | 'absent',
    public readonly absence: VerifiedAbsence | null,
    message = '',
  ) {
    super('NonInclusionVerification', status, message);
  }
}

function reject(verdict: NonInclusionRejection, message: string): NonInclusionVerification {
  return new VerificationOutcome(VerificationStatus.FAIL, verdict, null, message) as NonInclusionVerification;
}

/**
 * Verify that a decoded proof establishes the absence of the state it was requested for **at the snapshot its unicity
 * certificate certifies**. Absence is a fact about that one root, not about now.
 *
 * Order: (1) the certificate for the expected unsharded partition: empty shard id with an empty shard path, 32-byte
 * technical record hash, optional pinned configuration hash, no nil path entries, and the shard and partition path to
 * the seal hash; (2) the seal against the context's trust base with the strict authenticator (network, exact epoch, not
 * before the epoch start, quorum), and an authenticated epoch end if given; (3) the minimum round; (4) the state tree
 * relation: every junction chosen like the terminal, the path reaching the certified root, the terminal different from
 * the state. The result is a {@link VerificationResult}; the evidence is `absence`, obtainable only here.
 *
 * @param {NonInclusionProof} proof Decoded proof, bound to its state id.
 * @param {Pick<IVerificationContext, 'trustBase' | 'unicityCertificateVerifier'>} context Trusted authority.
 * @param {INonInclusionVerificationOptions} options What the application expects.
 * @returns {Promise<NonInclusionVerification>} `OK` with the `absence`, or `FAIL` with the first failing check.
 * @throws {TypeError} If `options.session` is anchored to another trust base.
 */
export async function verifyNonInclusion(
  proof: NonInclusionProof,
  context: Pick<IVerificationContext, 'trustBase' | 'unicityCertificateVerifier'>,
  options: INonInclusionVerificationOptions,
): Promise<NonInclusionVerification> {
  // each member of the caller's context is read once, with the context as the receiver
  const trustBase = context.trustBase;
  const verifier = context.unicityCertificateVerifier;
  if (options.session && options.session.sourceTrustBase !== trustBase) {
    throw new TypeError('The session is anchored to another trust base than the context.');
  }
  const uc = proof.unicityCertificate;
  const seal = uc.unicitySeal;

  // 1. the certificate itself
  const path = uc.shardTreeCertificate;
  if (path.shard.length !== 0 || path.siblingHashList.length !== 0) {
    return reject('uc_invalid', 'A non-inclusion certificate needs the empty shard id with an empty shard path.');
  }
  if (uc.unicityTreeCertificate.partitionIdentifier !== options.expectedPartition) {
    return reject('uc_invalid', 'The certificate is of another partition than expected.');
  }
  if (uc.technicalRecordHash?.length !== 32) {
    return reject('uc_invalid', 'The technical record hash must be 32 bytes.');
  }
  if (
    options.shardConfigurationHash &&
    !areUint8ArraysEqual(options.shardConfigurationHash, uc.shardConfigurationHash)
  ) {
    return reject('uc_invalid', 'The shard configuration differs from the pinned one.');
  }
  const root = uc.inputRecord.nullableHash;
  if (root !== null && root.length !== 32) {
    return reject('uc_invalid', 'The state root must be null (the empty tree) or 32 bytes.');
  }
  if (uc.unicityTreeCertificate.steps.some((step) => step == null)) {
    return reject('uc_invalid', 'The partition path has a nil step.');
  }
  if ((await UnicitySealHashMatchesWithRootHashRule.verify(uc)).status !== VerificationStatus.OK) {
    return reject('uc_invalid', 'The certificate path does not reach the seal hash.');
  }

  // 2. the authority, strictly
  // an operation scoped verifier (`beginOperation()`) shares its session, so seals already authenticated for inclusion
  // proofs are not checked again; `options.session` overrides
  const session =
    options.session ??
    (verifier instanceof OperationUnicityCertificateVerifier
      ? verifier.sessionFor(trustBase)
      : new SealVerificationSession(trustBase, verifier.quorumRule));
  const authenticated = await session.authenticate(seal);
  if (authenticated.status !== VerificationStatus.OK) {
    return reject('authority_rejected', authenticated.message || 'The seal is not authenticated.');
  }
  if (options.nextEpochStartRound !== undefined && seal.rootChainRoundNumber >= options.nextEpochStartRound) {
    return reject('authority_rejected', 'The seal is at or after the end of its epoch.');
  }

  // 3. freshness, as the caller defines it
  if (options.minRound !== undefined && seal.rootChainRoundNumber < options.minRound) {
    return reject('stale', 'The snapshot is older than the required round.');
  }

  // 4. the relation
  const relation = await proof.certificate.verifyAgainstTrustedRoot(proof.stateId, root);
  if (relation !== 'absent') {
    return reject(
      relation,
      relation === 'state_included' ? 'The authenticated leaf is the state.' : 'The path is invalid.',
    );
  }
  return new VerificationOutcome(
    VerificationStatus.OK,
    'absent',
    new VerifiedAbsence(CAPABILITY, proof.stateId, seal.rootChainRoundNumber, root),
  ) as NonInclusionVerification;
}
