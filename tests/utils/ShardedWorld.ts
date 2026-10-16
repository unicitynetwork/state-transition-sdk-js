import { numberToBytesBE } from '@noble/curves/utils.js';

import { createRootTrustBase } from './RootTrustBaseFixture.js';
import { BatchProofError } from '../../src/api/BatchProofError.js';
import { InputRecord } from '../../src/api/bft/InputRecord.js';
import { PartitionView, PartitionViewLeaf } from '../../src/api/bft/PartitionView.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { ShardId } from '../../src/api/bft/ShardId.js';
import { UnicityCertificate } from '../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../src/api/bft/UnicitySeal.js';
import { HashStep, UnicityTreeCertificate } from '../../src/api/bft/UnicityTreeCertificate.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import {
  IBatchAggregatorClient,
  IBatchRequestOptions,
  InclusionProofBatch,
} from '../../src/api/IBatchAggregatorClient.js';
import { InclusionCertificate } from '../../src/api/InclusionCertificate.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { IRequestOptions } from '../../src/api/IRequestOptions.js';
import { calculateLeafValue } from '../../src/api/LeafValue.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { StateId } from '../../src/api/StateId.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { ShardTree } from '../../src/internal/bft/ShardTree.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { SparseMerkleTree } from '../../src/smt/radix/SparseMerkleTree.js';
import { SparseMerkleTreeRootNode } from '../../src/smt/radix/SparseMerkleTreeRootNode.js';
import { compareUint8Arrays } from '../../src/util/TypedArrayUtils.js';

export const WORLD_PARTITION = 0x0a0b0c0dn;
const BASE_TIME = 1_700_000_000n;

export function shardIdFromBits(bits: string): ShardId {
  const bytes = new Uint8Array(Math.floor(bits.length / 8) + 1);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      bytes[Math.floor(i / 8)] |= 0x80 >> (i % 8);
    }
  }
  bytes[Math.floor(bits.length / 8)] |= 0x80 >> (bits.length % 8);
  return ShardId.decode(bytes);
}

/** All shard ids of a complete scheme with 2^bits shards, in canonical order. */
export function schemeOf(bits: number): string[] {
  return bits === 0 ? [''] : Array.from({ length: 1 << bits }, (_, i) => i.toString(2).padStart(bits, '0'));
}

function hashOf(label: string): Uint8Array {
  return new Uint8Array(32).map((_, i) => (label.charCodeAt(i % label.length) + i * 7) & 0xff);
}

interface IRound {
  readonly number: bigint;
  readonly roots: Map<string, SparseMerkleTreeRootNode>;
  readonly seal: UnicitySeal;
  readonly tree: ShardTree;
  readonly ucs: Map<string, UnicityCertificate>;
  readonly view: PartitionView;
}

/** What a test can do to one shard aggregator. */
export interface IShardFaults {
  /** Fail the next `getInclusionProofs` calls with these errors (consumed in order). */
  failBatch?: unknown[];
  /** Held until released, then proceeds; rejects with an AbortError if the request is aborted meanwhile. */
  gate?: Promise<void>;
  /** Serve the latest view this many rounds late (publication lag). */
  lag?: number;
  /** Rewrite the batch just before it is returned (tampering, byte flips). */
  tamper?: (batch: InclusionProofBatch, exact: boolean) => InclusionProofBatch;
  /** Omit the partition view of latest responses. */
  withholdView?: boolean;
}

/**
 * An in-process partition: 2^bits shard aggregators with real sparse Merkle trees under one root chain that seals the
 * shard tree of all shards every round, signed by one test authority. Every accepted request is its own round (so
 * proofs of one token are certified under different seals), like the single shard test aggregator.
 */
export class ShardedWorld {
  public readonly faults = new Map<string, IShardFaults>();

  public inFlight = 0;

  public readonly leafTimes = new Map<string, bigint>();

  public maxInFlight = 0;

  public readonly requests: { exactRoot: string | null; method: string; shard: string }[] = [];

  public retainedRounds = 1000;

  public readonly rounds: IRound[] = [];

  public readonly trustBase: RootTrustBase;

  private readonly shardRound = new Map<string, bigint>();

  private readonly shards = new Map<string, { leaves: Map<string, CertificationData>; smt: SparseMerkleTree }>();

  private readonly signer = SigningService.generate();

  private time = BASE_TIME;

  private constructor(public readonly bits: string[]) {
    this.trustBase = createRootTrustBase(this.signer.publicKey);
    for (const b of bits) {
      this.shards.set(b, {
        leaves: new Map(),
        smt: new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)),
      });
      this.shardRound.set(b, 0n);
    }
  }

  public get latest(): IRound {
    return this.rounds[this.rounds.length - 1];
  }

  public get network(): NetworkId {
    return NetworkId.LOCAL;
  }

  /** A single client that routes submissions by prefix, for the token flows. */
  public get router(): IAggregatorClient {
    const clients = this.bits.map((b) => this.client(b));
    const find = (stateId: StateId): ShardAggregator =>
      clients.find((c) => c.shardId.length === 0 || c.shardId.isPrefixOf(stateId.data)) as ShardAggregator;
    return {
      getInclusionProof: (stateId, options) => find(stateId).getInclusionProof(stateId, options),
      submitCertificationRequest: async (certificationData) =>
        find(await StateId.fromCertificationData(certificationData)).submitCertificationRequest(certificationData),
    };
  }

  public get scheme(): ShardId[] {
    return this.bits.length === 1 && this.bits[0] === '' ? [] : this.bits.map(shardIdFromBits);
  }

  public static async create(shardBits: number): Promise<ShardedWorld> {
    const world = new ShardedWorld(schemeOf(shardBits));
    await world.commit(new Set(world.bits));
    return world;
  }

  /** Accept a leaf into its shard and certify it in a new round. Returns the reference time of the round. */
  public async add(certificationData: CertificationData): Promise<bigint> {
    const stateId = await StateId.fromCertificationData(certificationData);
    const bits = this.shardOf(stateId);
    const shard = this.shard(bits);
    const key = HexKey(stateId.data);
    const referenceTime = this.time;
    if (!shard.leaves.has(key)) {
      shard.leaves.set(key, certificationData);
      this.leafTimes.set(key, referenceTime);
      await shard.smt.addLeaf(
        stateId.data,
        (await calculateLeafValue(certificationData.transactionHash, referenceTime)).data,
      );
      await this.commit(new Set([bits]));
    }
    return referenceTime;
  }

  /** One client per shard: the routing configuration of the application. */
  public client(bits: string): ShardAggregator {
    return new ShardAggregator(this, bits);
  }

  /** Advance the root chain without any shard changing (repeat/unchanged rounds). */
  public async idle(rounds = 1): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await this.commit(new Set());
    }
  }

  public retained(): IRound[] {
    return this.rounds.slice(-this.retainedRounds);
  }

  public shard(bits: string): { leaves: Map<string, CertificationData>; smt: SparseMerkleTree } {
    return this.shards.get(bits) as { leaves: Map<string, CertificationData>; smt: SparseMerkleTree };
  }

  public shardOf(stateId: StateId): string {
    return this.bits.find((b) => b === '' || shardIdFromBits(b).isPrefixOf(stateId.data)) as string;
  }

  private async commit(changed: Set<string>): Promise<void> {
    const number = BigInt(this.rounds.length + 1);
    this.time += 1n;
    const roots = new Map<string, SparseMerkleTreeRootNode>();
    const leaves: PartitionViewLeaf[] = [];
    const previous = this.rounds.at(-1);
    for (const b of this.bits) {
      const root = await this.shard(b).smt.calculateRoot();
      roots.set(b, root);
      const before = previous?.view.leaves.find((l) => l.shardId.toString() === b)?.inputRecord;
      const hasChanged = changed.has(b) || !before;
      const shardRound = (this.shardRound.get(b) as bigint) + (hasChanged ? 1n : 0n);
      this.shardRound.set(b, shardRound);
      const ir = hasChanged
        ? new InputRecord(
            shardRound,
            0n,
            before?.nullableHash ?? null,
            root.hash.data,
            new Uint8Array(0),
            this.time,
            hashOf(`block-${b}-${number}`),
            0n,
            null,
          )
        : new InputRecord(shardRound, 0n, root.hash.data, root.hash.data, new Uint8Array(0), this.time, null, 0n, null);
      leaves.push(new PartitionViewLeaf(shardIdFromBits(b), ir, hashOf(`tr-${b}-${number}`), hashOf(`conf-${b}`)));
    }
    const view = new PartitionView(WORLD_PARTITION, leaves);
    const tree = await ShardTree.create(
      view.leaves.map((l) => ({
        inputRecord: l.inputRecord,
        shard: l.shardId,
        shardConfigurationHash: l.shardConfigurationHash,
        technicalRecordHash: l.technicalRecordHash,
      })),
    );

    // partition path: the other partition is fabricated, the seal hash is what the path evaluates to
    const key = numberToBytesBE(WORLD_PARTITION, 4);
    const siblingKey = 0x01010101n;
    const siblingHash = hashOf(`other-partition-${number}`);
    const leafHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(new Uint8Array([0x01])))
      .update(CborSerializer.encodeByteString(key))
      .update(
        CborSerializer.encodeByteString(
          (await new DataHasher(HashAlgorithm.SHA256).update(CborSerializer.encodeByteString(tree.rootHash)).digest())
            .data,
        ),
      )
      .digest();
    const stepKey = numberToBytesBE(siblingKey, 4);
    const hasher = new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(new Uint8Array([0x00])))
      .update(CborSerializer.encodeByteString(stepKey));
    if (compareUint8Arrays(key, stepKey) > 0) {
      hasher
        .update(CborSerializer.encodeByteString(siblingHash))
        .update(CborSerializer.encodeByteString(leafHash.data));
    } else {
      hasher
        .update(CborSerializer.encodeByteString(leafHash.data))
        .update(CborSerializer.encodeByteString(siblingHash));
    }
    const sealHash = (await hasher.digest()).data;
    const utc = new UnicityTreeCertificate(WORLD_PARTITION, [new HashStep(siblingKey, siblingHash)]);
    const seal = await UnicitySeal.create(
      NetworkId.LOCAL,
      number,
      0n,
      this.time,
      previous?.seal.hash ?? null,
      sealHash,
      new Map([['NODE', this.signer]]),
    );
    const ucs = new Map<string, UnicityCertificate>();
    for (const leaf of view.leaves) {
      ucs.set(
        leaf.shardId.toString(),
        new UnicityCertificate(
          leaf.inputRecord,
          leaf.technicalRecordHash,
          leaf.shardConfigurationHash,
          tree.certificate(leaf.shardId),
          utc,
          seal,
        ),
      );
    }
    this.rounds.push({ number, roots, seal, tree, ucs, view });
  }
}

function HexKey(data: Uint8Array): string {
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The aggregator of one shard of a {@link ShardedWorld}: single proofs, submissions and the batch capability. */
export class ShardAggregator implements IAggregatorClient, IBatchAggregatorClient {
  public readonly shardId: ShardId;

  public constructor(
    private readonly world: ShardedWorld,
    public readonly bits: string,
  ) {
    this.shardId = shardIdFromBits(bits);
  }

  public async getInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<InclusionProofResponse> {
    await this.pass(options);
    this.world.requests.push({ exactRoot: null, method: 'getInclusionProof', shard: this.bits });
    const round = this.world.latest;
    const key = HexKey(stateId.data);
    const certificationData = this.world.shard(this.bits).leaves.get(key);
    const uc = round.ucs.get(this.bits) as UnicityCertificate;
    if (!certificationData) {
      return InclusionProofResponse.notCertified(round.number, uc);
    }
    return InclusionProofResponse.certified(
      round.number,
      new InclusionProof(
        certificationData,
        this.world.leafTimes.get(key) as bigint,
        InclusionCertificate.create(round.roots.get(this.bits) as SparseMerkleTreeRootNode, stateId.data),
        uc,
      ),
    );
  }

  public async getInclusionProofs(
    stateIds: readonly StateId[],
    options?: IBatchRequestOptions,
  ): Promise<InclusionProofBatch> {
    const exact = options?.stateRoot ? HexKey(options.stateRoot.data) : null;
    this.world.requests.push({ exactRoot: exact, method: 'getInclusionProofs', shard: this.bits });
    const faults = this.world.faults.get(this.bits);
    this.world.maxInFlight = Math.max(this.world.maxInFlight, ++this.world.inFlight);
    try {
      await this.pass(options);
      return this.serveBatch(stateIds, exact, faults);
    } finally {
      this.world.inFlight--;
    }
  }

  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    this.world.requests.push({ exactRoot: null, method: 'submit', shard: this.bits });
    await this.world.add(certificationData);
    return CertificationResponse.create(CertificationStatus.SUCCESS);
  }

  /** Honour a held gate and the abort signal, like a request in flight. */
  private async pass(options?: IRequestOptions): Promise<void> {
    const gate = this.world.faults.get(this.bits)?.gate;
    if (options?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    if (!gate) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
        once: true,
      });
      void gate.then(resolve);
    });
  }

  private serveBatch(
    stateIds: readonly StateId[],
    exact: string | null,
    faults: IShardFaults | undefined,
  ): InclusionProofBatch {
    const failure = faults?.failBatch?.shift();
    if (failure) {
      throw failure as Error;
    }

    // the finalized local view: the newest retained round for latest, the newest round with that root for exact
    const rounds = this.world.retained();
    const round = exact
      ? [...rounds]
          .reverse()
          .find((r) => HexKey((r.roots.get(this.bits) as SparseMerkleTreeRootNode).hash.data) === exact)
      : rounds.at(-1 - (faults?.lag ?? 0));
    if (!round) {
      throw new BatchProofError('unavailable', 'view not retained', {
        code: -32008,
        detail: 'view_not_retained',
        retryable: true,
      });
    }
    const root = round.roots.get(this.bits) as SparseMerkleTreeRootNode;
    const uc = round.ucs.get(this.bits) as UnicityCertificate;
    const proofs = stateIds.map((stateId) => {
      const key = HexKey(stateId.data);
      const certificationData = this.world.shard(this.bits).leaves.get(key);
      try {
        const certificate = InclusionCertificate.create(root, stateId.data);
        if (!certificationData) {
          throw new Error('absent');
        }
        return InclusionProofResponse.certified(
          round.number,
          new InclusionProof(certificationData, this.world.leafTimes.get(key) as bigint, certificate, uc),
        );
      } catch {
        throw new BatchProofError('unavailable', 'state not included', {
          code: -32008,
          detail: 'state_not_included',
          retryable: true,
        });
      }
    });
    const batch = new InclusionProofBatch(proofs, exact || faults?.withholdView ? null : round.view.toCBOR());
    return faults?.tamper ? faults.tamper(batch, exact !== null) : batch;
  }
}
