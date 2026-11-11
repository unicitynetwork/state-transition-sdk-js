import { AGGREGATION_PARTITION_ID } from './bft/AggregationPartition.js';
import { ShardId } from './bft/ShardId.js';
import { UnicitySealHashMatchesWithRootHashRule } from './bft/verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { SealVerificationSession } from './bft/verification/SealVerificationSession.js';
import { findNoTrustBaseEntry, NoTrustBaseEntryResult } from './bft/verification/TrustBaseEntryResult.js';
import { OperationUnicityCertificateVerifier } from './bft/verification/UnicityCertificateVerifier.js';
import { NonInclusionProof } from './NonInclusionProof.js';
import { StateId } from './StateId.js';
import { IVerificationContext } from '../transaction/verification/IVerificationContext.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

const CAPABILITY = Symbol('NonInclusionVerification');
const MAX_STEP_KEY = 0xffffffffn;

/**
 * The authenticated snapshot a non-inclusion verification speaks for. Every field is read from the authenticated
 * unicity certificate and its input record, never from RPC block metadata or the time of receipt.
 *
 * ```ts
 * // checkpoint: obtained independently of the proof and of the server response
 * const r = await verifyNonInclusion(proof, trustedContext);
 * if (r.verdict !== 'absent_at_snapshot') throw new Error('No verified absence');
 * if (r.snapshot.networkId !== checkpoint.networkId ||
 *     r.snapshot.rootRound < checkpoint.requiredRootRound) {
 *   throw new Error('Snapshot does not meet application policy');
 * }
 * // Absence at r.snapshot only; any spend/finality decision needs its own policy.
 * ```
 *
 * Non-inclusion proves absence only at the authenticated snapshot returned by verification. It does not prove absence
 * now, continuous absence, or that a token can be spent. Compare the snapshot’s network and root round (or its certified
 * seal timestamp under your application’s time policy) with an independently trusted requirement. The seal timestamp is
 * a consensus-certified time, not proof of real-time freshness. Do not use unverified response metadata for this check.
 *
 * Only obtainable from {@link verifyNonInclusion}; it cannot be constructed, forged or mutated, and it owns copies of
 * its bytes.
 */
export class NonInclusionSnapshot {
  /** Network of the authenticated seal. */
  public readonly networkId: number;
  /** Partition of the certificate: always {@link AGGREGATION_PARTITION_ID}. */
  public readonly partitionId: bigint;
  /** Epoch of the seal. */
  public readonly rootEpoch: bigint;
  /** Root chain round of the seal: the round of the snapshot. */
  public readonly rootRound: bigint;
  /** Time of the seal in Unix seconds, a consensus-certified time. */
  public readonly sealTimestampSeconds: bigint;
  /** Epoch of the shard's input record. */
  public readonly shardEpoch: bigint;
  /** Round of the shard's input record. */
  public readonly shardRound: bigint;

  readonly #shardId: Uint8Array;
  readonly #stateRoot: Uint8Array | null;

  /**
   * @internal
   * @param {symbol} capability Module private capability, not available outside this module.
   * @param {INonInclusionSnapshotParts} parts The authenticated values.
   */
  public constructor(capability: symbol, parts: INonInclusionSnapshotParts) {
    if (capability !== CAPABILITY) {
      throw new TypeError('A NonInclusionSnapshot is only obtained from verifyNonInclusion().');
    }
    this.networkId = parts.networkId;
    this.partitionId = parts.partitionId;
    this.rootEpoch = parts.rootEpoch;
    this.rootRound = parts.rootRound;
    this.sealTimestampSeconds = parts.sealTimestampSeconds;
    this.shardEpoch = parts.shardEpoch;
    this.shardRound = parts.shardRound;
    this.#shardId = parts.shardId.encode();
    this.#stateRoot = parts.stateRoot ? new Uint8Array(parts.stateRoot) : null;
    Object.freeze(this);
  }

  /**
   * @returns {ShardId} A fresh copy of the shard of the certificate, the empty shard for an unsharded partition.
   */
  public get shardId(): ShardId {
    return ShardId.decode(this.#shardId);
  }

  /**
   * @returns {Uint8Array|null} Copy of the state root of the snapshot, `null` for the certified empty tree.
   */
  public get stateRoot(): Uint8Array | null {
    return this.#stateRoot ? new Uint8Array(this.#stateRoot) : null;
  }
}

/** The authenticated values of a {@link NonInclusionSnapshot}. */
export interface INonInclusionSnapshotParts {
  readonly networkId: number;
  readonly partitionId: bigint;
  readonly rootEpoch: bigint;
  readonly rootRound: bigint;
  readonly sealTimestampSeconds: bigint;
  readonly shardEpoch: bigint;
  readonly shardId: ShardId;
  readonly shardRound: bigint;
  readonly stateRoot: Uint8Array | null;
}

/**
 * Why a proof was rejected, from the first check that failed, in this order: the certificate is not valid for the fixed
 * aggregation partition and the expected shard (`uc_invalid`), its seal is not from the trusted authority
 * (`authority_rejected`), or the path does not reach the root (`certificate_invalid`). A proof that does not decode is
 * not a rejection but an error of {@link NonInclusionProof.decode}.
 */
export type NonInclusionRejection = 'authority_rejected' | 'certificate_invalid' | 'uc_invalid';

/**
 * Explicit context of {@link verifyNonInclusion}: what the application expects, never taken from the proof. The
 * partition is not a choice: it is {@link AGGREGATION_PARTITION_ID}. Freshness is not a verifier option either: it is
 * a decision of the caller on the returned snapshot.
 */
export interface INonInclusionVerificationOptions {
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
  /**
   * Shard of the partition the application expects, like Go `noninclusion.Context.Shard` and Rust `with_shard`: the
   * empty shard (the default) is the unsharded form, a certificate of any shard is then `uc_invalid`. A nonempty shard
   * needs a shard path with exactly one sibling per bit, and the queried state and the authenticated terminal leaf must
   * belong to it. Never taken from the proof.
   */
  readonly shard?: ShardId;
  /** Pinned shard configuration hash of the partition. */
  readonly shardConfigurationHash?: Uint8Array;
}

/**
 * Result of {@link verifyNonInclusion}: narrow on `verdict`. Only the two snapshot verdicts carry a `snapshot`; a
 * rejection carries none.
 *
 * Non-inclusion proves absence only at the authenticated snapshot returned by verification. It does not prove absence
 * now, continuous absence, or that a token can be spent. Compare the snapshot’s network and root round (or its certified
 * seal timestamp under your application’s time policy) with an independently trusted requirement. The seal timestamp is
 * a consensus-certified time, not proof of real-time freshness. Do not use unverified response metadata for this check.
 */
export type NonInclusionVerification =
  | {
      /** None for a snapshot outcome. */
      readonly cause: null;
      /** Empty for a snapshot outcome. */
      readonly reason: '';
      readonly snapshot: NonInclusionSnapshot;
      readonly stateId: StateId;
      readonly verdict: 'absent_at_snapshot' | 'included_at_snapshot';
    }
  | {
      /**
       * The typed "no trust-base entry for this epoch" failure, when that is why the seal was not authenticated (verdict
       * `authority_rejected`): the held history ends before the seal's epoch. Nothing is known to be wrong with the proof; obtain
       * the missing entries and verify again ({@link verifyWithUpdate} does that). `null` for every other rejection.
       */
      readonly cause: NoTrustBaseEntryResult | null;
      /**
       * Diagnostic text for logs only: do not parse it and do not base a decision on it. It may quote values of the
       * unverified proof (for example the epoch of a seal that was not authenticated); the decision is `verdict`.
       */
      readonly reason: string;
      readonly snapshot: null;
      readonly stateId: StateId;
      readonly verdict: NonInclusionRejection;
    };

function reject(
  stateId: StateId,
  verdict: NonInclusionRejection,
  reason: string,
  cause: NoTrustBaseEntryResult | null = null,
): NonInclusionVerification {
  return Object.freeze({ cause, reason, snapshot: null, stateId, verdict });
}

/**
 * Verify a decoded proof against a trusted authority and report **the authenticated snapshot** it speaks for: the state
 * is `absent_at_snapshot`, or (a valid path proving that exact key present) `included_at_snapshot`; anything else is a
 * rejection without any snapshot metadata. Both outcomes are facts about that one root, not about now.
 *
 * Non-inclusion proves absence only at the authenticated snapshot returned by verification. It does not prove absence
 * now, continuous absence, or that a token can be spent. Compare the snapshot’s network and root round (or its certified
 * seal timestamp under your application’s time policy) with an independently trusted requirement. The seal timestamp is
 * a consensus-certified time, not proof of real-time freshness. Do not use unverified response metadata for this check.
 *
 * ```ts
 * // checkpoint: obtained independently of the proof and of the server response
 * const r = await verifyNonInclusion(proof, trustedContext);
 * if (r.verdict !== 'absent_at_snapshot') throw new Error('No verified absence');
 * if (r.snapshot.networkId !== checkpoint.networkId ||
 *     r.snapshot.rootRound < checkpoint.requiredRootRound) {
 *   throw new Error('Snapshot does not meet application policy');
 * }
 * // Absence at r.snapshot only; any spend/finality decision needs its own policy.
 * ```
 *
 * Order: (1) the certificate for the fixed aggregation partition ({@link AGGREGATION_PARTITION_ID}) and the expected
 * shard (the empty shard unless `options.shard`; exactly one shard path sibling per shard id bit), 32-byte technical
 * record hash, optional pinned configuration hash, a structurally valid input record, no nil path entries or step keys
 * beyond 32 bits, and the shard and partition path to the seal hash; (2) the seal against the context's trust base
 * with the strict authenticator (network, exact epoch, not before the epoch start, quorum), and an authenticated epoch
 * end if given; (3) for a sharded certificate the membership of the state and of the terminal leaf in the shard; (4)
 * the state tree relation: every junction chosen like the terminal, the path reaching the certified root. No snapshot is
 * built before all of it holds. There is no freshness option: that is the caller's decision on the snapshot.
 *
 * @param {NonInclusionProof} proof Decoded proof, bound to its state id.
 * @param {Pick<IVerificationContext, 'trustBase' | 'unicityCertificateVerifier'>} context Trusted authority.
 * @param {INonInclusionVerificationOptions} [options] What the application expects.
 * @returns {Promise<NonInclusionVerification>} The snapshot outcome, or the first failing check.
 * @throws {TypeError} If `options.session` is anchored to another trust base.
 */
export async function verifyNonInclusion(
  proof: NonInclusionProof,
  context: Pick<IVerificationContext, 'trustBase' | 'unicityCertificateVerifier'>,
  options: INonInclusionVerificationOptions = {},
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
  const expectedShard = options.shard ?? ShardId.ROOT;
  const path = uc.shardTreeCertificate;
  if (!path.shard.equals(expectedShard)) {
    return reject(proof.stateId, 'uc_invalid', 'The certificate is of another shard than expected.');
  }
  if (path.siblingHashList.length !== expectedShard.length) {
    return reject(proof.stateId, 'uc_invalid', 'The shard path needs exactly one sibling per bit of the shard id.');
  }
  if (uc.unicityTreeCertificate.partitionIdentifier !== AGGREGATION_PARTITION_ID) {
    return reject(proof.stateId, 'uc_invalid', 'The certificate is not of the aggregation partition.');
  }
  if (uc.technicalRecordHash?.length !== 32) {
    return reject(proof.stateId, 'uc_invalid', 'The technical record hash must be 32 bytes.');
  }
  if (
    options.shardConfigurationHash &&
    !areUint8ArraysEqual(options.shardConfigurationHash, uc.shardConfigurationHash)
  ) {
    return reject(proof.stateId, 'uc_invalid', 'The shard configuration differs from the pinned one.');
  }
  const root = uc.inputRecord.nullableHash;
  if (root !== null && root.length !== 32) {
    return reject(proof.stateId, 'uc_invalid', 'The state root must be null (the empty tree) or 32 bytes.');
  }
  const irFailure = uc.inputRecord.structureFailure();
  if (irFailure !== null) {
    return reject(proof.stateId, 'uc_invalid', `The input record is malformed: ${irFailure}`);
  }
  // a step key is a 32-bit partition id: anything else is malformed input, whatever it does to the path
  if (uc.unicityTreeCertificate.steps.some((step) => step == null || step.key < 0n || step.key > MAX_STEP_KEY)) {
    return reject(proof.stateId, 'uc_invalid', 'The partition path has a nil step or a step key beyond 32 bits.');
  }
  let pathReachesSeal = false;
  try {
    pathReachesSeal = (await UnicitySealHashMatchesWithRootHashRule.verify(uc)).status === VerificationStatus.OK;
  } catch {
    // malformed material never throws out of verification
  }
  if (!pathReachesSeal) {
    return reject(proof.stateId, 'uc_invalid', 'The certificate path does not reach the seal hash.');
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
    return reject(
      proof.stateId,
      'authority_rejected',
      authenticated.message || 'The seal is not authenticated.',
      findNoTrustBaseEntry(authenticated),
    );
  }
  if (options.nextEpochStartRound !== undefined && seal.rootChainRoundNumber >= options.nextEpochStartRound) {
    return reject(proof.stateId, 'authority_rejected', 'The seal is at or after the end of its epoch.');
  }

  // 3. a sharded certificate speaks for its own keys only: the prefix bits of the shard id are not junctions of the
  // shard's tree, so the fold alone would accept a query (or a terminal) of another shard
  if (expectedShard.length !== 0) {
    const terminalKey = proof.certificate.terminalKeyBytes;
    if (!expectedShard.isPrefixOf(proof.stateId.data)) {
      return reject(proof.stateId, 'certificate_invalid', 'The state does not belong to the shard.');
    }
    if (terminalKey !== null && !expectedShard.isPrefixOf(terminalKey)) {
      return reject(proof.stateId, 'certificate_invalid', 'The terminal leaf does not belong to the shard.');
    }
  }

  // 4. the relation
  const relation = await proof.certificate.verifyAgainstTrustedRoot(proof.stateId, root);
  if (relation === 'certificate_invalid') {
    return reject(proof.stateId, 'certificate_invalid', 'The path is invalid.');
  }
  // everything is authenticated: only now the snapshot is built, from the authenticated certificate
  const snapshot = new NonInclusionSnapshot(CAPABILITY, {
    networkId: seal.networkId.id,
    partitionId: uc.unicityTreeCertificate.partitionIdentifier,
    rootEpoch: seal.epoch,
    rootRound: seal.rootChainRoundNumber,
    sealTimestampSeconds: seal.timestamp,
    shardEpoch: uc.inputRecord.epoch,
    shardId: path.shard,
    shardRound: uc.inputRecord.roundNumber,
    stateRoot: root,
  });
  return Object.freeze({
    cause: null,
    reason: '',
    snapshot,
    stateId: proof.stateId,
    verdict: relation === 'state_included' ? 'included_at_snapshot' : 'absent_at_snapshot',
  });
}
