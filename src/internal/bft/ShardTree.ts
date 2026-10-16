import { InputRecord } from '../../api/bft/InputRecord.js';
import { ShardId } from '../../api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../api/bft/UnicityCertificate.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';

/**
 * Committed content of one shard tree leaf.
 */
export interface IShardTreeInput {
  readonly inputRecord: InputRecord;
  readonly shard: ShardId;
  readonly shardConfigurationHash: Uint8Array;
  readonly technicalRecordHash: Uint8Array | null;
}

/**
 * Native shard tree of one partition, reconstructed from complete leaf set.
 *
 * Leaf hash is `H(IR, TRHash, ShardConfHash)`, inner node is `H(left, right)` with each child hash CBOR byte-string
 * encoded, the shard id only determines the tree position. A single shard partition has a leaf as the root.
 */
export class ShardTree {
  private constructor(private readonly nodes: ReadonlyMap<string, Uint8Array>) {}

  /**
   * @returns {Uint8Array} Copy of the root hash.
   */
  public get rootHash(): Uint8Array {
    return new Uint8Array(this.nodes.get('') as Uint8Array);
  }

  /**
   * Build the tree. The leaves must be exactly the shards of a complete prefix-free scheme (the caller validates the
   * topology), a single shard partition has the one empty shard id.
   *
   * @param {IShardTreeInput[]} leaves Leaves of all shards.
   * @returns {Promise<ShardTree>} The tree.
   * @throws {Error} If the leaves do not form a complete tree.
   */
  public static async create(leaves: readonly IShardTreeInput[]): Promise<ShardTree> {
    const nodes = new Map<string, Uint8Array>();
    for (const leaf of leaves) {
      const key = leaf.shard.toString();
      if (nodes.has(key)) {
        throw new Error(`Duplicate shard ${JSON.stringify(key)}.`);
      }
      nodes.set(
        key,
        (
          await UnicityCertificate.calculateShardLeafHash(
            leaf.inputRecord,
            leaf.technicalRecordHash,
            leaf.shardConfigurationHash,
          )
        ).data,
      );
    }

    const leafCount = nodes.size;
    let reached = 0;
    const generate = async (prefix: string): Promise<Uint8Array> => {
      const existing = nodes.get(prefix);
      if (existing) {
        reached++;
        return existing;
      }
      if (prefix.length >= 256) {
        throw new Error('Shard tree is not complete.');
      }
      const left = await generate(`${prefix}0`);
      const right = await generate(`${prefix}1`);
      const hash = (
        await new DataHasher(HashAlgorithm.SHA256)
          .update(CborSerializer.encodeByteString(left))
          .update(CborSerializer.encodeByteString(right))
          .digest()
      ).data;
      nodes.set(prefix, hash);
      return hash;
    };
    await generate('');

    // every leaf must have been reached by the descent, otherwise a leaf below another leaf was supplied
    if (reached !== leafCount) {
      throw new Error('Shard tree leaves are not prefix-free.');
    }

    return new ShardTree(nodes);
  }

  /**
   * Shard tree certificate (sibling hashes from the leaf to the root) of the shard.
   *
   * @param {ShardId} shard Shard of a leaf.
   * @returns {ShardTreeCertificate} Certificate.
   * @throws {Error} If the shard is not a leaf of the tree.
   */
  public certificate(shard: ShardId): ShardTreeCertificate {
    const key = shard.toString();
    if (!this.nodes.has(key)) {
      throw new Error(`Shard ${JSON.stringify(key)} is not in the tree.`);
    }

    const siblings: Uint8Array[] = [];
    for (let length = key.length; length > 0; length--) {
      const prefix = key.slice(0, length - 1);
      const sibling = `${prefix}${key[length - 1] === '0' ? '1' : '0'}`;
      siblings.push(new Uint8Array(this.nodes.get(sibling) as Uint8Array));
    }

    return new ShardTreeCertificate(shard, siblings);
  }
}
