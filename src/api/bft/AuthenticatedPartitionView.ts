import { PartitionView, IPartitionViewPolicy, PartitionViewLeaf } from './PartitionView.js';
import { PartitionViewError } from './PartitionViewError.js';
import { ShardId } from './ShardId.js';
import { UnicityCertificate } from './UnicityCertificate.js';
import { UnicitySeal } from './UnicitySeal.js';
import { ISealAuthenticator } from './verification/ISealAuthenticator.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { partitionViewMetrics } from '../../internal/bft/PartitionViewMetrics.js';
import { ShardTree } from '../../internal/bft/ShardTree.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { NetworkId } from '../NetworkId.js';

/** Capability to construct, held by this module only (the symbol is not exported). */
const AUTHENTICATED = Symbol('authenticated');

interface IAuthenticatedParts {
  readonly authority: string;
  readonly enclosing: Uint8Array;
  readonly leaves: readonly Uint8Array[];
  readonly partitionId: bigint;
  readonly policy: string;
  readonly tree: ShardTree;
}

/**
 * Partition view whose complete content is committed by an authenticated seal.
 *
 * Instances come only from {@link PartitionViewAuthenticator.authenticate}, after the view hashed into the enclosing
 * certificate's partition path and seal hash, matched the enclosing certificate's own leaf exactly, and the complete
 * seal was authenticated under the verifier's anchored authority (network, exact epoch, round at least the epoch
 * start, quorum). There is no flag or map a caller can supply to obtain one, and no reachable factory.
 *
 * Immutable and independent of every object graph it was built from or hands out: it holds only private canonical
 * bytes and the private authenticated shard tree, all snapshotted before verification, and every accessor builds fresh
 * copies. Per-shard work is lazy and indexed: a lookup decodes and derives only that shard's leaf and certificate
 * (O(1) leaves, O(depth) hashes already held by the tree), not the whole view, and nothing is derived for shards nobody
 * asks for.
 *
 * The committed scheme and configuration hashes are authenticated by the commitment itself, they are not taken from
 * the response on trust and no independent hash list is required.
 */
export class AuthenticatedPartitionView {
  /** Identity of the anchored authority and verifier policy the seal was authenticated under. */
  public readonly authority: string;
  /** Partition id. */
  public readonly partitionId: bigint;
  /** Identity of the optional pins applied during authentication. */
  public readonly policy: string;

  readonly #enclosing: Uint8Array;
  readonly #index: ReadonlyMap<string, number>;
  readonly #leaves: readonly Uint8Array[];
  readonly #tree: ShardTree;

  /**
   * Not callable outside this module, use {@link PartitionViewAuthenticator.authenticate}.
   *
   * @param {symbol} capability Module private capability.
   * @param {IAuthenticatedParts} parts Verified parts, canonical bytes.
   */
  public constructor(capability: typeof AUTHENTICATED, parts: IAuthenticatedParts) {
    if ((capability as symbol) !== AUTHENTICATED) {
      throw new Error('AuthenticatedPartitionView can only be created by PartitionViewAuthenticator.');
    }
    this.authority = parts.authority;
    this.partitionId = parts.partitionId;
    this.policy = parts.policy;
    this.#enclosing = new Uint8Array(parts.enclosing);
    this.#leaves = parts.leaves.map((bytes) => new Uint8Array(bytes));
    this.#tree = parts.tree;
    // the shard to position index, built once while the view is already authenticated: O(S)
    this.#index = new Map(
      this.#leaves.map((bytes, position) => [ShardId.decode(decodeShardBytes(bytes)).toString(), position]),
    );
    Object.freeze(this);
  }

  /**
   * @returns {PartitionViewLeaf[]} Independent copies of the committed leaves in canonical order.
   */
  public get leaves(): PartitionViewLeaf[] {
    return this.#leaves.map((bytes) => PartitionViewLeaf.fromCBOR(bytes));
  }

  /**
   * @returns {NetworkId} Network of the authenticated seal.
   */
  public get networkId(): NetworkId {
    return this.seal.networkId;
  }

  /**
   * @returns {ShardId[]} Committed sharding scheme, empty for a single shard partition.
   */
  public get scheme(): ShardId[] {
    const ids = this.#leaves.map((bytes) => ShardId.decode(decodeShardBytes(bytes)));
    return ids.length === 1 && ids[0].length === 0 ? [] : ids;
  }

  /**
   * @returns {UnicitySeal} Independent copy of the complete authenticated seal.
   */
  public get seal(): UnicitySeal {
    return UnicityCertificate.fromCBOR(this.#enclosing).unicitySeal;
  }

  /**
   * Ordinary version 1 unicity certificates of every shard in canonical order, each carrying the shared partition
   * certificate and the identical complete master seal. Shards in their initial state keep their native null input
   * record fields. Every call returns independent objects. Derives all S certificates; use
   * {@link AuthenticatedPartitionView.certificateOf} for the shards that are needed.
   *
   * @returns {UnicityCertificate[]} Certificates.
   */
  public assembleCertificates(): UnicityCertificate[] {
    return this.#leaves.map((_, position) => this.derive(position));
  }

  /**
   * @param {ShardId} shard Shard of the partition.
   * @returns {UnicityCertificate} Independent copy of the certificate of the shard.
   * @throws {Error} If the shard is not committed by the view.
   */
  public certificateOf(shard: ShardId): UnicityCertificate {
    const position = this.#index.get(shard.toString());
    if (position === undefined) {
      throw new PartitionViewError('topology', `Shard "${shard.toString()}" is not in the authenticated view.`);
    }
    return this.derive(position);
  }

  /**
   * Independent copy of one committed leaf, found through the private index: decodes only that leaf.
   *
   * @param {ShardId} shard Shard of the partition.
   * @returns {PartitionViewLeaf} Leaf of the shard.
   * @throws {Error} If the shard is not committed by the view.
   */
  public leafOf(shard: ShardId): PartitionViewLeaf {
    const position = this.#index.get(shard.toString());
    if (position === undefined) {
      throw new PartitionViewError('topology', `Shard "${shard.toString()}" is not in the authenticated view.`);
    }
    return PartitionViewLeaf.fromCBOR(this.#leaves[position]);
  }

  /** One shard's certificate from its leaf, the authenticated tree and the shared partition path and seal. */
  private derive(position: number): UnicityCertificate {
    partitionViewMetrics.certificateDerivations++;
    const leaf = PartitionViewLeaf.fromCBOR(this.#leaves[position]);
    const enclosing = UnicityCertificate.fromCBOR(this.#enclosing);
    return new UnicityCertificate(
      leaf.inputRecord,
      leaf.technicalRecordHash,
      leaf.shardConfigurationHash,
      this.#tree.certificate(leaf.shardId),
      enclosing.unicityTreeCertificate,
      enclosing.unicitySeal,
    );
  }
}

/** The encoded shard id (the first item) of an encoded leaf, without decoding the rest. */
function decodeShardBytes(leaf: Uint8Array): Uint8Array {
  return CborDeserializer.decodeByteString(CborDeserializer.decodeArray(leaf, 4)[0]);
}

/**
 * Builds the authenticated object from checked parts. Module private: not exported, not a member of any exported class.
 *
 * @param {PartitionView} view Verified view (private snapshot).
 * @param {ShardTree} tree Tree rebuilt from the view.
 * @param {UnicityCertificate} uc Verified enclosing certificate (private snapshot).
 * @param {string} authority Authority identity.
 * @param {string} policy Policy identity.
 * @returns {AuthenticatedPartitionView} Authenticated view.
 */
function createAuthenticated(
  view: PartitionView,
  tree: ShardTree,
  uc: UnicityCertificate,
  authority: string,
  policy: string,
): AuthenticatedPartitionView {
  return new AuthenticatedPartitionView(AUTHENTICATED, {
    authority,
    enclosing: uc.toCBOR(),
    leaves: view.leaves.map((leaf) => leaf.toCBOR()),
    partitionId: view.partitionId,
    policy,
    tree,
  });
}

/**
 * Turns an untrusted candidate {@link PartitionView} into an {@link AuthenticatedPartitionView}.
 *
 * Steps: structural validation of the candidate (distinct valid prefixes, complete coverage, canonical order, optional
 * pins), shard tree rebuild and partition path evaluation to the seal hash (nil path steps rejected), exact match of
 * the enclosing certificate's own leaf, then authentication of the complete seal by the anchored authority. The
 * authority is the caller's, never derived from the response.
 *
 * Optional pins (scheme, per-shard configuration hashes) are a stricter policy. They are deep-copied at construction;
 * the same private snapshot is applied to every check and produces {@link PartitionViewAuthenticator.identity}, which
 * keys the bounded memo of authenticated views and should key any cache derived from them. Inputs are snapshotted to
 * private canonical bytes before any asynchronous work.
 */
export class PartitionViewAuthenticator {
  private static readonly MAX_ENTRIES = 16;

  private readonly completed = new Map<string, AuthenticatedPartitionView>();
  private readonly inFlight = new Map<string, Promise<AuthenticatedPartitionView>>();
  private readonly pins: IPartitionViewPolicy;
  private readonly policyId: string;

  /**
   * @param {bigint} partition Partition the caller expects.
   * @param {ISealAuthenticator} sealAuthenticator Authenticates the master seal under the anchored authority.
   * @param {IPartitionViewPolicy} [policy] Optional stricter pins, copied.
   */
  public constructor(
    private readonly partition: bigint,
    private readonly sealAuthenticator: ISealAuthenticator,
    policy: IPartitionViewPolicy = {},
  ) {
    const scheme = policy.scheme ? Object.freeze(policy.scheme.map((id) => ShardId.decode(id.encode()))) : undefined;
    // validates the pinned scheme and fixes the identity to its canonical order
    const order = scheme ? PartitionView.canonicalShardOrder(scheme) : undefined;
    // deep copies, validated now: a pin that is malformed or duplicated is an error of the configuration
    const pins = policy.shardConfigurationPins?.map((pin) => ({
      hash: new Uint8Array(pin.hash),
      shard: ShardId.decode(pin.shard.encode()),
    }));
    const keys = new Set<string>();
    for (const pin of pins ?? []) {
      if (pin.hash.length !== 32) {
        throw new PartitionViewError(
          'bounds',
          `Pinned configuration hash of shard "${pin.shard.toString()}" must be 32 bytes.`,
        );
      }
      if (keys.has(pin.shard.toString())) {
        throw new PartitionViewError('topology', `Shard "${pin.shard.toString()}" is pinned more than once.`);
      }
      keys.add(pin.shard.toString());
    }
    if (scheme && pins?.some((pin) => !order?.some((id) => id.equals(pin.shard)))) {
      throw new PartitionViewError('topology', 'A pinned shard is not a shard of the pinned scheme.');
    }
    this.pins = Object.freeze({ scheme, shardConfigurationPins: pins ? Object.freeze(pins) : undefined });
    this.policyId = JSON.stringify([
      order ? order.map((id) => id.toString()) : null,
      pins
        ? pins
            .map((pin) => [pin.shard.toString(), HexConverter.encode(pin.hash)])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        : null,
    ]);
  }

  /**
   * @returns {string} Identity of partition, authority and pins; part of any cache or session key.
   */
  public get identity(): string {
    return JSON.stringify([this.partition.toString(), this.sealAuthenticator.identity, this.policyId]);
  }

  /**
   * Authenticate a candidate view against its enclosing certificate. The arguments are snapshotted first, later
   * mutation of the caller's buffers or objects cannot affect the outcome or the result.
   *
   * @param {PartitionView | Uint8Array} candidate Candidate view or its bytes.
   * @param {UnicityCertificate | Uint8Array} enclosing Certificate (or its bytes) carrying the seal.
   * @returns {Promise<AuthenticatedPartitionView>} Authenticated view.
   * @throws {PartitionViewError} If any check fails.
   */
  public async authenticate(
    candidate: PartitionView | Uint8Array,
    enclosing: UnicityCertificate | Uint8Array,
  ): Promise<AuthenticatedPartitionView> {
    // snapshot to private canonical bytes before anything asynchronous; nested shape first so that native encoding
    // never sees a nil element
    const viewBytes = candidate instanceof Uint8Array ? new Uint8Array(candidate) : candidate.toCBOR();
    let ucBytes: Uint8Array;
    if (enclosing instanceof Uint8Array) {
      ucBytes = new Uint8Array(enclosing);
    } else {
      enclosing.unicityTreeCertificate.steps.forEach((step, i) => {
        if (step == null) {
          throw new PartitionViewError('tree_mismatch', `Unicity tree certificate hash step ${i} is nil.`);
        }
      });
      ucBytes = enclosing.toCBOR();
    }
    const view = PartitionView.fromCBOR(viewBytes);
    const uc = PartitionView.decodeEnclosingCertificate(ucBytes);
    uc.unicityTreeCertificate.steps.forEach((step, i) => {
      if (step == null) {
        throw new PartitionViewError('tree_mismatch', `Unicity tree certificate hash step ${i} is nil.`);
      }
    });

    const key = HexConverter.encode(
      (
        await new DataHasher(HashAlgorithm.SHA256)
          .update(
            CborSerializer.encodeArray(
              CborSerializer.encodeTextString(this.identity),
              CborSerializer.encodeByteString(viewBytes),
              CborSerializer.encodeByteString(ucBytes),
            ),
          )
          .digest()
      ).imprint,
    );
    const done = this.completed.get(key);
    if (done) {
      return done;
    }
    const running = this.inFlight.get(key);
    if (running) {
      return running;
    }

    const run = this.#run(view, uc).then(
      (authenticated) => {
        this.inFlight.delete(key);
        if (this.completed.size >= PartitionViewAuthenticator.MAX_ENTRIES) {
          const oldest = this.completed.keys().next();
          if (!oldest.done) {
            this.completed.delete(oldest.value);
          }
        }
        this.completed.set(key, authenticated);
        return authenticated;
      },
      (error: unknown) => {
        this.inFlight.delete(key);
        throw error;
      },
    );
    this.inFlight.set(key, run);
    return run;
  }

  async #run(view: PartitionView, uc: UnicityCertificate): Promise<AuthenticatedPartitionView> {
    // 1-3: candidate structure, tree and partition path to the seal hash, exact enclosing leaf
    const tree = await view.checkCommitmentUnauthenticated(uc, this.partition, this.pins);

    // 4: only then the seal, under the caller's anchored authority
    const authority = this.sealAuthenticator.identity;
    const result = await this.sealAuthenticator.authenticate(uc.unicitySeal);
    if (result.status !== VerificationStatus.OK) {
      throw new PartitionViewError('seal_invalid', `Authenticating unicity seal: ${result.message || 'failed'}.`);
    }

    return createAuthenticated(view, tree, uc, authority, this.policyId);
  }
}
