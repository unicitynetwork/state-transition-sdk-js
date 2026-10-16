import { InputRecord } from '../../../src/api/bft/InputRecord.js';
import { PartitionViewError } from '../../../src/api/bft/PartitionViewError.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { canonicalShardOrder, ITopologyMetrics } from '../../../src/internal/bft/ShardTopology.js';
import { ShardTree } from '../../../src/internal/bft/ShardTree.js';

const BIG = 1 << 16;

function idOf(bits: string): ShardId {
  const bytes = new Uint8Array(Math.floor(bits.length / 8) + 1);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      bytes[Math.floor(i / 8)] |= 0x80 >> (i % 8);
    }
  }
  bytes[Math.floor(bits.length / 8)] |= 0x80 >> (bits.length % 8);
  return ShardId.decode(bytes);
}

/** 2^k equal-width shards in canonical order. */
function balanced(k: number): string[] {
  return Array.from({ length: 1 << k }, (_, i) => i.toString(2).padStart(k, '0'));
}

function work(scheme: readonly string[]): number {
  const metrics: ITopologyMetrics = { comparisons: 0 };
  canonicalShardOrder(scheme.map(idOf), BIG, 256, metrics);
  return metrics.comparisons;
}

/** The previous algorithm, kept as the slow reference model: pairwise prefix scan, then Kraft sum. */
function referenceAccepts(scheme: readonly string[]): boolean {
  if (scheme.length < 2 || scheme.some((b) => b.length === 0 || b.length > 256)) {
    return false;
  }
  for (const [i, a] of scheme.entries()) {
    for (const [j, b] of scheme.entries()) {
      if (i !== j && b.startsWith(a)) {
        return false;
      }
    }
  }
  const max = Math.max(...scheme.map((b) => b.length));
  const sum = scheme.reduce((acc, b) => acc + (1n << BigInt(max - b.length)), 0n);
  return sum === 1n << BigInt(max);
}

function accepts(scheme: readonly string[]): boolean {
  try {
    canonicalShardOrder(scheme.map(idOf), BIG, 256);
    return true;
  } catch (e) {
    expect(e).toBeInstanceOf(PartitionViewError);
    return false;
  }
}

/** Deterministic pseudo random numbers. */
function rng(seed: number): () => number {
  let x = seed;
  return (): number => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** A random complete prefix-free scheme by splitting leaves. */
function randomScheme(random: () => number, shards: number): string[] {
  let leaves = ['0', '1'];
  while (leaves.length < shards) {
    const i = Math.floor(random() * leaves.length);
    const [leaf] = leaves.splice(i, 1);
    leaves.push(`${leaf}0`, `${leaf}1`);
  }
  leaves = leaves.sort();
  return leaves;
}

describe('canonical shard topology work', () => {
  const sweep = [3, 4, 5, 6, 7, 8, 9, 10, 11];

  it('is linear in the number of shards for an input that is already canonical', () => {
    const counts = sweep.map((k) => ({ comparisons: work(balanced(k)), shards: 1 << k }));
    // exactly one sortedness pass and one neighbor pass: 2(S-1) comparisons, no log factor and no square
    for (const { comparisons, shards } of counts) {
      expect(comparisons).toEqual(2 * (shards - 1));
    }
  });

  it('is S log S for any other order, never S squared', () => {
    for (const k of sweep) {
      const shards = 1 << k;
      const comparisons = work(balanced(k).reverse());
      expect(comparisons).toBeLessThanOrEqual(shards * (Math.log2(shards) + 2));
      // the reference scan would do S*(S-1) prefix tests alone
      expect(comparisons).toBeLessThan((shards * (shards - 1)) / (k > 4 ? 2 : 1));
    }
  });

  it('agrees with the pairwise reference model on valid and corrupted schemes', () => {
    const random = rng(12345);
    for (let round = 0; round < 300; round++) {
      const shards = 2 + Math.floor(random() * 30);
      const scheme = randomScheme(random, shards);
      expect(referenceAccepts(scheme)).toBe(true);
      expect(accepts(scheme)).toBe(true);
      // the canonical order is the sorted order, whatever order the scheme came in
      const shuffled = scheme.slice().sort(() => random() - 0.5);
      expect(canonicalShardOrder(shuffled.map(idOf), BIG, 256).map(String)).toEqual(scheme);

      const corrupt = (mutate: (s: string[]) => string[]): void => {
        const mutated = mutate(scheme.slice());
        expect(accepts(mutated)).toBe(referenceAccepts(mutated));
      };
      corrupt((s) => s.slice(1)); // a gap
      corrupt((s) => [...s, s[0]]); // a duplicate
      corrupt((s) => [...s, s[Math.floor(random() * s.length)] + '0']); // an overlap
      corrupt((s) => s.map((b, i) => (i === 0 ? b.slice(0, -1) || '0' : b))); // a shortened id
      corrupt((s) => [...s, '1'.repeat(257)]); // too wide
      corrupt((s) => s.slice(0, 1)); // a single shard
    }
  });

  it('keeps the admission limits', () => {
    expect(() => canonicalShardOrder(balanced(4).map(idOf), 8, 256)).toThrow(PartitionViewError);
    expect(() => canonicalShardOrder([idOf('0'), idOf('1')], 8, 0)).toThrow(PartitionViewError);
    expect(canonicalShardOrder([], 8, 256)).toHaveLength(1);
  });
});

describe('shard tree reconstruction', () => {
  const ir = (): InputRecord =>
    new InputRecord(
      1n,
      0n,
      new Uint8Array(32),
      new Uint8Array(32).fill(1),
      new Uint8Array(0),
      1n,
      new Uint8Array(32).fill(2),
      0n,
      null,
    );
  const leaves = (bits: string[]): Parameters<typeof ShardTree.create>[0] =>
    bits.map((b) => ({
      inputRecord: ir(),
      shard: idOf(b),
      shardConfigurationHash: new Uint8Array(32).fill(3),
      technicalRecordHash: new Uint8Array(32).fill(4),
    }));

  it('builds complete trees and refuses a leaf below another leaf without a quadratic prefix scan', async () => {
    for (const k of [1, 2, 3, 4, 6]) {
      const tree = await ShardTree.create(leaves(balanced(k)));
      expect(tree.certificate(idOf(balanced(k)[0])).siblingHashList).toHaveLength(k);
    }
    await expect(ShardTree.create(leaves(['0', '00', '01', '1']))).rejects.toThrow('prefix-free');
    await expect(ShardTree.create(leaves(['00', '01', '10']))).rejects.toThrow();
  });
});
