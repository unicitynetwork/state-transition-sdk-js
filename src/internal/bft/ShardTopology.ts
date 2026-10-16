import { PartitionViewError } from '../../api/bft/PartitionViewError.js';
import { ShardId } from '../../api/bft/ShardId.js';

/** The single shard of an unsharded partition: the empty shard id, native encoding `80`. */
export const SINGLE_SHARD = ShardId.ROOT;

/**
 * Hardware-independent work counter of a topology validation.
 */
export interface ITopologyMetrics {
  /** Comparisons of two shard bit strings (sortedness check, sorting, prefix neighbor check). */
  comparisons: number;
}

/**
 * Shard ids of a complete prefix-free sharding scheme in binary tree left-to-right order (lexicographic bit string, `0`
 * before `1`). The empty scheme yields the single empty shard id.
 *
 * Validation is O(S) comparisons for an input that is already canonical and O(S log S) otherwise (S shards, bounded
 * id width): a prefix relation between two ids of a lexicographically sorted list always shows between neighbors
 * (everything between a prefix and an id it prefixes starts with that prefix), so no pairwise scan is needed, and
 * completeness is the Kraft sum over the sorted ids.
 *
 * @param {readonly ShardId[]} scheme Sharding scheme.
 * @param {number} maxLeaves Admission limit of shards.
 * @param {number} maxBits Admission limit of the id length in bits.
 * @param {ITopologyMetrics} [metrics] Optional counter of the work done.
 * @returns {ShardId[]} Shard ids in canonical order.
 * @throws {PartitionViewError} `topology` if the scheme is not a complete prefix-free set within the limits.
 */
export function canonicalShardOrder(
  scheme: readonly ShardId[],
  maxLeaves: number,
  maxBits: number,
  metrics?: ITopologyMetrics,
): ShardId[] {
  if (scheme.length === 0) {
    return [SINGLE_SHARD];
  }
  if (scheme.length > maxLeaves) {
    throw new PartitionViewError('topology', `Scheme has ${scheme.length} shards, limit is ${maxLeaves}.`);
  }
  // a single shard partition is the empty scheme, never a one element scheme
  if (scheme.length === 1) {
    throw new PartitionViewError('topology', 'Scheme can not contain a single shard.');
  }

  const count = (): void => {
    if (metrics) {
      metrics.comparisons++;
    }
  };
  const compare = (a: { bits: string }, b: { bits: string }): number => {
    count();
    return a.bits < b.bits ? -1 : a.bits > b.bits ? 1 : 0;
  };

  const ids = scheme.map((id) => ({ bits: id.toString(), id }));
  let maxLength = 0;
  for (const { bits } of ids) {
    if (bits.length === 0) {
      throw new PartitionViewError('topology', 'Scheme may not contain the empty shard id.');
    }
    if (bits.length > maxBits) {
      throw new PartitionViewError('topology', `Shard ID ${bits} is longer than ${maxBits} bits.`);
    }
    maxLength = Math.max(maxLength, bits.length);
  }

  // one pass tells a canonical input, which then needs no sort
  let sorted = true;
  for (let i = 1; i < ids.length && sorted; i++) {
    sorted = compare(ids[i - 1], ids[i]) <= 0;
  }
  const order = sorted ? ids : ids.slice().sort(compare);

  for (let i = 1; i < order.length; i++) {
    count();
    if (order[i].bits.startsWith(order[i - 1].bits)) {
      throw new PartitionViewError(
        'topology',
        `Scheme is not prefix-free: ${order[i - 1].bits} is prefix of ${order[i].bits}.`,
      );
    }
  }
  // a prefix-free scheme covers the whole tree iff the Kraft sum equals one
  const sum = order.reduce((acc, { bits }) => acc + (1n << BigInt(maxLength - bits.length)), 0n);
  if (sum !== 1n << BigInt(maxLength)) {
    throw new PartitionViewError('topology', 'Scheme does not cover the whole shard tree.');
  }

  return order.map(({ id }) => id);
}
