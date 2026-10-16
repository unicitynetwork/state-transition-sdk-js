import { InputRecord } from './InputRecord.js';
import { PartitionViewError } from './PartitionViewError.js';
import { ShardId } from './ShardId.js';
import { UnicityCertificate } from './UnicityCertificate.js';
import { UnicitySealHashMatchesWithRootHashRule } from './verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { SealVerificationSession } from './verification/SealVerificationSession.js';
import { partitionViewMetrics } from '../../internal/bft/PartitionViewMetrics.js';
import { canonicalShardOrder } from '../../internal/bft/ShardTopology.js';
import { ShardTree } from '../../internal/bft/ShardTree.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborError } from '../../serialization/cbor/CborError.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

/**
 * Optional stricter policy a candidate view is additionally checked against. The view is authenticated by its
 * commitment under the enclosing seal; pins from the verifier's own configuration (never from the response carrying the
 * view) only narrow what is accepted. Pins are part of the identity of the authenticator that applies them.
 */
export interface IPartitionViewPolicy {
  /**
   * Required sharding scheme: empty for a single shard partition, otherwise at least two shards forming a complete
   * prefix-free set.
   */
  readonly scheme?: readonly ShardId[];
  /**
   * Pinned shard configuration hashes. Every pinned shard must be a shard of the view, a shard is pinned at most once
   * and every hash is 32 bytes; anything else is rejected, never silently ignored (a pin that is not consulted would
   * make the policy fail open). Shards without a pin are not constrained.
   */
  readonly shardConfigurationPins?: readonly IShardConfigurationPin[];
}

/**
 * Pinned configuration hash of one shard.
 */
export interface IShardConfigurationPin {
  /** The shard's 32-byte configuration hash. */
  readonly hash: Uint8Array;
  /** The shard. */
  readonly shard: ShardId;
}

const HASH_LENGTH = 32;

/**
 * Committed content of one shard in a {@link PartitionView}.
 */
export class PartitionViewLeaf {
  private readonly _shardConfigurationHash: Uint8Array;
  private readonly _technicalRecordHash: Uint8Array;

  public constructor(
    public readonly shardId: ShardId,
    public readonly inputRecord: InputRecord,
    technicalRecordHash: Uint8Array,
    shardConfigurationHash: Uint8Array,
  ) {
    this._technicalRecordHash = new Uint8Array(technicalRecordHash);
    this._shardConfigurationHash = new Uint8Array(shardConfigurationHash);
  }

  /**
   * @returns {Uint8Array} Copy of the shard configuration hash.
   */
  public get shardConfigurationHash(): Uint8Array {
    return new Uint8Array(this._shardConfigurationHash);
  }

  /**
   * @returns {Uint8Array} Copy of the technical record hash.
   */
  public get technicalRecordHash(): Uint8Array {
    return new Uint8Array(this._technicalRecordHash);
  }

  /**
   * Strictly decode one encoded leaf and check its bounds.
   *
   * @param {Uint8Array} bytes CBOR `[shardId, inputRecord, trHash, shardConfHash]`.
   * @returns {PartitionViewLeaf} Decoded leaf.
   * @throws {PartitionViewError} If the bytes are not a valid leaf.
   */
  public static fromCBOR(bytes: Uint8Array): PartitionViewLeaf {
    const leaf = decodeLeaf(bytes);
    leaf.validateBounds();
    return leaf;
  }

  /**
   * @returns {Uint8Array} CBOR encoding `[shardId, inputRecord, trHash, shardConfHash]`.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(this.shardId.encode()),
      this.inputRecord.toCBOR(),
      CborSerializer.encodeByteString(this._technicalRecordHash),
      CborSerializer.encodeByteString(this._shardConfigurationHash),
    );
  }

  /**
   * Check the per leaf limits. Does not know the expected topology.
   *
   * @returns {void}
   * @throws {PartitionViewError} If the leaf is out of bounds.
   */
  public validateBounds(): void {
    if (this.shardId.length > PartitionView.MAX_SHARD_ID_BITS) {
      throw new PartitionViewError(
        'bounds',
        `Shard ID is ${this.shardId.length} bits, limit is ${PartitionView.MAX_SHARD_ID_BITS}.`,
      );
    }

    const ir = this.inputRecord;
    const hash = ir.nullableHash ?? new Uint8Array(0);
    const previousHash = ir.previousHash ?? new Uint8Array(0);
    const blockHash = ir.blockHash ?? new Uint8Array(0);

    // same rules as the native input record validation
    if (ir.roundNumber !== 0n && ir.nullableSummaryValue === null) {
      throw new PartitionViewError('bounds', 'Input record summary value is nil.');
    }
    if (ir.roundNumber !== 0n && ir.timestamp === 0n) {
      throw new PartitionViewError('bounds', 'Input record timestamp is unassigned.');
    }
    const unchanged = areUint8ArraysEqual(previousHash, hash);
    if (unchanged && blockHash.length !== 0) {
      throw new PartitionViewError('bounds', "Input record state hash didn't change but block hash is not nil.");
    }
    if (!unchanged && blockHash.length === 0) {
      throw new PartitionViewError('bounds', 'Input record block hash is nil but state hash changed.');
    }

    if (ir.summaryValue.length > PartitionView.MAX_SUMMARY_VALUE_BYTES) {
      throw new PartitionViewError(
        'bounds',
        `Summary value is ${ir.summaryValue.length} bytes, limit is ${PartitionView.MAX_SUMMARY_VALUE_BYTES}.`,
      );
    }
    for (const [name, value] of [
      ['state hash', hash],
      ['previous hash', previousHash],
      ['block hash', blockHash],
      ['executed transactions hash', ir.executedTransactionsHash ?? new Uint8Array(0)],
    ] as const) {
      // absent/empty (initial state, unchanged state) or a full hash
      if (value.length !== 0 && value.length !== HASH_LENGTH) {
        throw new PartitionViewError('bounds', `${name} must be empty or ${HASH_LENGTH} bytes, got ${value.length}.`);
      }
    }
    const irLength = ir.toCBOR().length;
    if (irLength > PartitionView.MAX_INPUT_RECORD_BYTES) {
      throw new PartitionViewError(
        'bounds',
        `Input record is ${irLength} bytes, limit is ${PartitionView.MAX_INPUT_RECORD_BYTES}.`,
      );
    }
    if (this._technicalRecordHash.length !== HASH_LENGTH) {
      throw new PartitionViewError('bounds', `TRHash must be ${HASH_LENGTH} bytes.`);
    }
    if (this._shardConfigurationHash.length !== HASH_LENGTH) {
      throw new PartitionViewError('bounds', `ShardConfHash must be ${HASH_LENGTH} bytes.`);
    }
  }
}

/**
 * Partition view: the complete vector of shard tree leaves of one partition, as committed by a single unicity seal.
 *
 * Untagged, explicitly versioned CBOR array `[1, partitionId, [[shardId, inputRecord, trHash, shardConfHash], ...]]`
 * from which the ordinary unicity certificates of every shard can be derived. A decoded view is NOT trusted:
 * {@link PartitionViewAuthenticator.authenticate} authenticates it against the enclosing certificate and the seal.
 */
export class PartitionView {
  /** Maximum size of an encoded view. */
  public static readonly MAX_BYTES = 16 * 1024;

  /** Maximum size of an encoded input record. */
  public static readonly MAX_INPUT_RECORD_BYTES = 1024;

  /** Maximum number of shards in a view. */
  public static readonly MAX_LEAVES = 8;

  /** Maximum shard id length in bits. */
  public static readonly MAX_SHARD_ID_BITS = 256;

  /** Maximum size of the input record summary value. */
  public static readonly MAX_SUMMARY_VALUE_BYTES = 256;

  private static readonly MAX_PARTITION_ID = 0xffffffffn;

  private static readonly VERSION = 1n;

  private readonly _leaves: PartitionViewLeaf[];

  /**
   * @param {bigint} partitionId Partition id, nonzero 32-bit unsigned.
   * @param {PartitionViewLeaf[]} leaves Leaves in canonical order.
   * @throws {PartitionViewError} If the view is out of bounds.
   */
  public constructor(
    public readonly partitionId: bigint,
    leaves: readonly PartitionViewLeaf[],
  ) {
    this._leaves = leaves.slice();
    if (partitionId <= 0n || partitionId > PartitionView.MAX_PARTITION_ID) {
      throw new PartitionViewError('bounds', 'Partition ID must be a nonzero 32-bit unsigned integer.');
    }
    if (this._leaves.length < 1 || this._leaves.length > PartitionView.MAX_LEAVES) {
      throw new PartitionViewError(
        'bounds',
        `Leaf count must be 1..${PartitionView.MAX_LEAVES}, got ${this._leaves.length}.`,
      );
    }
    this._leaves.forEach((leaf, i) => {
      try {
        leaf.validateBounds();
      } catch (e) {
        throw e instanceof PartitionViewError ? new PartitionViewError(e.reason, `Leaf ${i}: ${e.message}`) : e;
      }
    });
  }

  /**
   * @returns {PartitionViewLeaf[]} Copy of the leaf list.
   */
  public get leaves(): PartitionViewLeaf[] {
    return this._leaves.slice();
  }

  /**
   * @returns {ShardId[]} Sharding scheme the candidate's leaves describe: empty for a single shard partition.
   *   Candidate data, not authenticated by itself.
   */
  public get scheme(): ShardId[] {
    return this._leaves.length === 1 && this._leaves[0].shardId.length === 0
      ? []
      : this._leaves.map((leaf) => leaf.shardId);
  }

  /**
   * @returns {bigint} Wire-format version of the view.
   */
  public get version(): bigint {
    return PartitionView.VERSION;
  }

  /**
   * Shard ids of the scheme in binary tree left-to-right order (lexicographic bit string, `0` before `1`). Empty
   * scheme yields the single empty shard id.
   *
   * @param {readonly ShardId[]} scheme Sharding scheme.
   * @returns {ShardId[]} Shard ids in canonical order.
   * @throws {PartitionViewError} If the scheme is not a complete prefix-free set within limits.
   */
  public static canonicalShardOrder(scheme: readonly ShardId[]): ShardId[] {
    return canonicalShardOrder(scheme, PartitionView.MAX_LEAVES, PartitionView.MAX_SHARD_ID_BITS);
  }

  /**
   * Decode the enclosing certificate of a view, rejecting any encoding that does not re-encode byte-identically, so
   * derived certificates carry exactly the master seal bytes that were authenticated.
   *
   * @param {Uint8Array} bytes CBOR bytes of a unicity certificate.
   * @returns {UnicityCertificate} Decoded certificate.
   * @throws {PartitionViewError} If decoding fails or the encoding is not canonical.
   */
  public static decodeEnclosingCertificate(bytes: Uint8Array): UnicityCertificate {
    let uc: UnicityCertificate;
    try {
      uc = UnicityCertificate.fromCBOR(bytes);
    } catch (e) {
      throw new PartitionViewError(
        'malformed',
        `Decoding enclosing unicity certificate: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!areUint8ArraysEqual(uc.toCBOR(), bytes)) {
      throw new PartitionViewError('malformed', 'Enclosing unicity certificate is not canonically encoded.');
    }
    return uc;
  }

  /**
   * Strictly decode a view: bounded input size, exact array lengths, no trailing bytes, no indefinite length items,
   * explicit version 1, untagged, and the encoding must be the canonical one.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {PartitionView} Decoded view, not authenticated.
   * @throws {PartitionViewError} If the bytes are not a valid view.
   */
  public static fromCBOR(bytes: Uint8Array): PartitionView {
    if (bytes.length > PartitionView.MAX_BYTES) {
      throw new PartitionViewError(
        'bounds',
        `Partition view is ${bytes.length} bytes, limit is ${PartitionView.MAX_BYTES}.`,
      );
    }
    partitionViewMetrics.viewDecodes++;

    let view: PartitionView;
    try {
      const data = CborDeserializer.decodeArray(bytes, 3);
      const version = CborDeserializer.decodeUnsignedInteger(data[0]);
      if (version !== PartitionView.VERSION) {
        throw new PartitionViewError('unsupported_version', `Unsupported partition view version ${version}.`);
      }
      const partitionId = CborDeserializer.decodeUnsignedInteger(data[1]);
      const leafItems = CborDeserializer.decodeArray(data[2]);
      if (leafItems.length < 1 || leafItems.length > PartitionView.MAX_LEAVES) {
        throw new PartitionViewError(
          'bounds',
          `Leaf count must be 1..${PartitionView.MAX_LEAVES}, got ${leafItems.length}.`,
        );
      }

      view = new PartitionView(
        partitionId,
        leafItems.map((item) => {
          return decodeLeaf(item); // the view validates the bounds of its leaves
        }),
      );
    } catch (e) {
      if (e instanceof PartitionViewError) {
        throw e;
      }
      if (e instanceof CborError || e instanceof RangeError) {
        throw new PartitionViewError('malformed', `Decoding partition view: ${e.message}`);
      }
      throw e;
    }

    // decoded fields have no other representation, but a mismatch would mean the decoder accepted a non-canonical form
    if (!areUint8ArraysEqual(view.toCBOR(), bytes)) {
      throw new PartitionViewError('malformed', 'Partition view is not canonically encoded.');
    }
    return view;
  }

  /**
   * Validate the structure and rebuild the native shard tree from the leaves.
   *
   * @param {bigint} partition Expected partition id.
   * @param {IPartitionViewPolicy} [policy] Optional pins.
   * @returns {Promise<ShardTree>} Shard tree, built from untrusted candidate data.
   * @throws {PartitionViewError} If the view is not well formed or does not match the pins.
   */
  public buildShardTree(partition: bigint, policy: IPartitionViewPolicy = {}): Promise<ShardTree> {
    this.validateStructure(partition, policy);
    return ShardTree.create(
      this._leaves.map((leaf) => ({
        inputRecord: leaf.inputRecord,
        shard: leaf.shardId,
        shardConfigurationHash: leaf.shardConfigurationHash,
        technicalRecordHash: leaf.technicalRecordHash,
      })),
    );
  }

  /**
   * Check that the view hashes into the unicity seal of the enclosing certificate: structure and topology are
   * validated, the partition certificate must be for the view's partition and the rebuilt shard tree root must evaluate
   * through it to the seal hash. The enclosing certificate's own shard leaf must match the view completely.
   *
   * The seal signatures are NOT checked here, see {@link PartitionViewAuthenticator.authenticate}.
   *
   * @param {UnicityCertificate} enclosingUc Certificate carrying the seal the view is committed under.
   * @param {bigint} partition Expected partition id.
   * @param {IPartitionViewPolicy} [policy] Optional pins.
   * @returns {Promise<ShardTree>} The rebuilt shard tree.
   * @throws {PartitionViewError} If the view is not committed by the certificate.
   */
  public async checkCommitmentUnauthenticated(
    enclosingUc: UnicityCertificate,
    partition: bigint,
    policy: IPartitionViewPolicy = {},
  ): Promise<ShardTree> {
    const tree = await this.buildShardTree(partition, policy);

    const utc = enclosingUc.unicityTreeCertificate;
    if (utc.partitionIdentifier !== this.partitionId) {
      throw new PartitionViewError(
        'tree_mismatch',
        `Enclosing certificate is for partition ${utc.partitionIdentifier}, view is for ${this.partitionId}.`,
      );
    }
    utc.steps.forEach((step, i) => {
      // not reachable through the wire decoder, but certificates may be constructed
      if (step == null) {
        throw new PartitionViewError('tree_mismatch', `Unicity tree certificate hash step ${i} is nil.`);
      }
    });

    // enclosing certificate's own leaf and native shard path
    const own = enclosingUc.shardTreeCertificate.shard;
    const leaf = this._leaves.find((l) => l.shardId.equals(own));
    if (!leaf) {
      throw new PartitionViewError(
        'enclosing_certificate_mismatch',
        `Enclosing certificate shard "${own.toString()}" is not in the view.`,
      );
    }
    const ownCertificate = tree.certificate(own);
    const ownSiblings = enclosingUc.shardTreeCertificate.siblingHashList;
    if (
      ownSiblings.length !== own.length ||
      ownSiblings.length !== ownCertificate.siblingHashList.length ||
      !ownSiblings.every((hash, i) => areUint8ArraysEqual(hash, ownCertificate.siblingHashList[i]))
    ) {
      throw new PartitionViewError(
        'enclosing_certificate_mismatch',
        'Enclosing certificate shard tree certificate does not match the view.',
      );
    }
    if (!areUint8ArraysEqual(enclosingUc.inputRecord.toCBOR(), leaf.inputRecord.toCBOR())) {
      throw new PartitionViewError(
        'enclosing_certificate_mismatch',
        'Enclosing certificate input record does not match the view leaf.',
      );
    }
    if (!areUint8ArraysEqual(enclosingUc.technicalRecordHash, leaf.technicalRecordHash)) {
      throw new PartitionViewError(
        'enclosing_certificate_mismatch',
        'Enclosing certificate TRHash does not match the view leaf.',
      );
    }
    if (!areUint8ArraysEqual(enclosingUc.shardConfigurationHash, leaf.shardConfigurationHash)) {
      throw new PartitionViewError(
        'enclosing_certificate_mismatch',
        'Enclosing certificate shard configuration hash does not match the view leaf.',
      );
    }

    const sealFailure = SealVerificationSession.checkSealStructure(enclosingUc.unicitySeal);
    if (sealFailure !== null) {
      throw new PartitionViewError('seal_invalid', `Enclosing certificate: ${sealFailure}`);
    }

    // the view's own tree through the partition path of the enclosing certificate must be the sealed hash
    const derived = this.deriveCertificate(leaf, tree, enclosingUc);
    const result = await UnicitySealHashMatchesWithRootHashRule.verify(derived);
    if (result.status !== VerificationStatus.OK) {
      throw new PartitionViewError('tree_mismatch', 'Partition view does not match the seal hash.');
    }

    return tree;
  }

  /**
   * Convert to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    const bytes = CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.version),
      CborSerializer.encodeUnsignedInteger(this.partitionId),
      CborSerializer.encodeArray(...this._leaves.map((leaf) => leaf.toCBOR())),
    );
    if (bytes.length > PartitionView.MAX_BYTES) {
      throw new PartitionViewError(
        'bounds',
        `Encoded partition view is ${bytes.length} bytes, limit is ${PartitionView.MAX_BYTES}.`,
      );
    }
    return bytes;
  }

  /**
   * Check that the view is a well formed candidate for the given partition: its leaves are distinct valid shard ids
   * forming a complete prefix-free scheme in canonical left-to-right order. The scheme is taken from the candidate
   * itself (it is authenticated later by the seal commitment); pins in `policy` only narrow it. Does not touch any
   * hash tree.
   *
   * @param {bigint} partition Expected partition id.
   * @param {IPartitionViewPolicy} [policy] Optional pins.
   * @returns {void}
   * @throws {PartitionViewError} If the view does not match.
   */
  public validateStructure(partition: bigint, policy: IPartitionViewPolicy = {}): void {
    if (this.partitionId !== partition) {
      throw new PartitionViewError(
        'topology',
        `Partition view is for partition ${this.partitionId}, expected ${partition}.`,
      );
    }
    const order = PartitionView.canonicalShardOrder(this.scheme);
    if (policy.scheme) {
      const pinned = PartitionView.canonicalShardOrder(policy.scheme);
      if (pinned.length !== order.length || pinned.some((id, i) => !id.equals(order[i]))) {
        throw new PartitionViewError('topology', 'Partition view scheme does not match the pinned scheme.');
      }
    }
    const pins = this.resolvePins(policy.shardConfigurationPins);
    this._leaves.forEach((leaf, i) => {
      if (!leaf.shardId.equals(order[i])) {
        throw new PartitionViewError(
          'topology',
          `Leaf ${i} is shard "${leaf.shardId.toString()}", expected "${order[i].toString()}".`,
        );
      }
      const pinned = pins.get(leaf.shardId.toString());
      if (pinned && !areUint8ArraysEqual(pinned, leaf.shardConfigurationHash)) {
        throw new PartitionViewError(
          'config_not_admitted',
          `Shard "${leaf.shardId.toString()}": configuration hash does not match the pinned configuration.`,
        );
      }
    });
  }

  private deriveCertificate(
    leaf: PartitionViewLeaf,
    tree: ShardTree,
    enclosingUc: UnicityCertificate,
  ): UnicityCertificate {
    return new UnicityCertificate(
      leaf.inputRecord,
      leaf.technicalRecordHash,
      leaf.shardConfigurationHash,
      tree.certificate(leaf.shardId),
      enclosingUc.unicityTreeCertificate,
      enclosingUc.unicitySeal,
    );
  }

  /** The pins by shard bit string; unknown shards, duplicates and wrong lengths are errors. */
  private resolvePins(pins: readonly IShardConfigurationPin[] | undefined): Map<string, Uint8Array> {
    const resolved = new Map<string, Uint8Array>();
    for (const pin of pins ?? []) {
      const key = pin.shard.toString();
      if (pin.hash.length !== HASH_LENGTH) {
        throw new PartitionViewError(
          'bounds',
          `Pinned configuration hash of shard "${key}" must be ${HASH_LENGTH} bytes, got ${pin.hash.length}.`,
        );
      }
      if (resolved.has(key)) {
        throw new PartitionViewError('topology', `Shard "${key}" is pinned more than once.`);
      }
      if (!this._leaves.some((leaf) => leaf.shardId.equals(pin.shard))) {
        throw new PartitionViewError('topology', `Pinned shard "${key}" is not a shard of the view.`);
      }
      resolved.set(key, pin.hash);
    }
    return resolved;
  }
}

/** Decode one leaf without checking its bounds. */
function decodeLeaf(bytes: Uint8Array): PartitionViewLeaf {
  partitionViewMetrics.leafDecodes++;
  try {
    const data = CborDeserializer.decodeArray(bytes, 4);
    return new PartitionViewLeaf(
      ShardId.decode(CborDeserializer.decodeByteString(data[0])),
      InputRecord.fromCBOR(data[1]),
      CborDeserializer.decodeByteString(data[2]),
      CborDeserializer.decodeByteString(data[3]),
    );
  } catch (e) {
    if (e instanceof CborError || e instanceof RangeError) {
      throw new PartitionViewError('malformed', `Decoding partition view leaf: ${e.message}`);
    }
    throw e;
  }
}
