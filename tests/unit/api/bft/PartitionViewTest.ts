import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PartitionViewAuthenticator } from '../../../../src/api/bft/AuthenticatedPartitionView.js';
import { InputRecord } from '../../../../src/api/bft/InputRecord.js';
import { IPartitionViewPolicy, PartitionView, PartitionViewLeaf } from '../../../../src/api/bft/PartitionView.js';
import { PartitionViewError } from '../../../../src/api/bft/PartitionViewError.js';
import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { ShardId } from '../../../../src/api/bft/ShardId.js';
import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../../../src/api/bft/UnicityTreeCertificate.js';
import { UnicitySealHashMatchesWithRootHashRule } from '../../../../src/api/bft/verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../../src/api/bft/verification/SealVerificationSession.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborMap } from '../../../../src/serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../../../src/serialization/cbor/CborMapEntry.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

const DIR = join(process.cwd(), 'tests/fixtures/uc-consolidation/partition-view/v1');
const PARTITION = 0x0a0b0c0dn;

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function file(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(DIR, name)));
}

interface IAssemblyVector {
  readonly enclosingUc: string;
  readonly epoch: number;
  readonly epochStartRound: number;
  readonly networkId: number;
  readonly nodeId: string;
  readonly shardConfigurationHashes: Record<string, string>;
  readonly shardTreeRoot: string;
  readonly shards: { readonly shard: string; readonly uc: string }[];
  readonly sigKey: string;
  readonly view: string;
}

function assemblyVector(shards: number | string): IAssemblyVector {
  return JSON.parse(readFileSync(join(DIR, `assembly-${shards}.json`), 'utf8')) as IAssemblyVector;
}

function shardIdOf(bits: string): ShardId {
  const bytes = new Uint8Array(Math.floor(bits.length / 8) + 1);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      bytes[Math.floor(i / 8)] |= 0x80 >> (i % 8);
    }
  }
  bytes[Math.floor(bits.length / 8)] |= 0x80 >> (bits.length % 8);
  return ShardId.decode(bytes);
}

function scheme(bits: number): ShardId[] {
  if (bits === 0) {
    return [];
  }
  return Array.from({ length: 1 << bits }, (_, i) => shardIdOf(i.toString(2).padStart(bits, '0')));
}

function trustBaseOf(
  v: IAssemblyVector,
  overrides: { epoch?: number; networkId?: number; sigKey?: string } = {},
): RootTrustBase {
  return RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: String(overrides.epoch ?? v.epoch),
    epochStartRound: String(v.epochStartRound),
    networkId: overrides.networkId ?? v.networkId,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: v.nodeId, sigKey: overrides.sigKey ?? v.sigKey, stake: '1' }],
    signatures: {},
    stateHash: '00',
    version: '1',
  });
}

function topologyOf(
  v: IAssemblyVector,
  bits: number,
): { scheme: ShardId[]; shardConfigurationPins: { hash: Uint8Array; shard: ShardId }[] } {
  return {
    scheme: scheme(bits),
    shardConfigurationPins: Object.entries(v.shardConfigurationHashes).map(([shard, hash]) => ({
      hash: HexConverter.decode(hash),
      shard: shardIdOf(shard),
    })),
  };
}

async function assembleVia(
  view: PartitionView,
  uc: UnicityCertificate,
  authority: SealVerificationSession,
  policy: IPartitionViewPolicy = {},
): Promise<UnicityCertificate[]> {
  return (
    await new PartitionViewAuthenticator(PARTITION, authority, policy).authenticate(view, uc)
  ).assembleCertificates();
}

function newSession(trustBase: RootTrustBase): SealVerificationSession {
  return new SealVerificationSession(
    trustBase,
    new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
  );
}

/** Replace one top level item of a CBOR array (possibly inside a tag). */
function replaceItem(data: Uint8Array, index: number, value: Uint8Array, tagged = false): Uint8Array {
  const tag = tagged ? CborDeserializer.decodeTag(data) : null;
  const items = CborDeserializer.decodeArray(tag ? tag.data : data);
  items[index] = value;
  const array = CborSerializer.encodeArray(...items);
  return tag ? CborSerializer.encodeTag(tag.tag, array) : array;
}

function withLeaf(
  view: PartitionView,
  index: number,
  change: (l: PartitionViewLeaf) => PartitionViewLeaf,
): PartitionView {
  return new PartitionView(
    view.partitionId,
    view.leaves.map((l, i) => (i === index ? change(l) : l)),
  );
}

function irWith(ir: InputRecord, change: Partial<Record<string, bigint | Uint8Array | null>>): InputRecord {
  const v = {
    blockHash: ir.blockHash,
    epoch: ir.epoch,
    executedTransactionsHash: ir.executedTransactionsHash,
    hash: ir.nullableHash,
    previousHash: ir.previousHash,
    roundNumber: ir.roundNumber,
    sumOfEarnedFees: ir.sumOfEarnedFees,
    summaryValue: ir.nullableSummaryValue,
    timestamp: ir.timestamp,
    ...change,
  };
  return new InputRecord(
    v.roundNumber,
    v.epoch,
    v.previousHash,
    v.hash,
    v.summaryValue,
    v.timestamp,
    v.blockHash,
    v.sumOfEarnedFees,
    v.executedTransactionsHash,
  );
}

async function expectReason(promise: Promise<unknown>, reason: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'PartitionViewError', reason });
}

function expectReasonSync(fn: () => unknown, reason: string): void {
  expect(fn).toThrow(PartitionViewError);
  try {
    fn();
  } catch (e) {
    expect((e as PartitionViewError).reason).toEqual(reason);
  }
}

describe('PartitionView codec', () => {
  it('encodes the minimal golden view', () => {
    const ir = new InputRecord(0n, 0n, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), 0n, null, 0n, null);
    const view = new PartitionView(1n, [
      new PartitionViewLeaf(shardIdOf(''), ir, new Uint8Array(32).fill(1), new Uint8Array(32).fill(2)),
    ]);
    // [1, 1, [[h'80', #39002([1,0,0,h'',h'',h'',0,null,0,null]), h'01..', h'02..']]] (Go test Test_PartitionView_Golden)
    const expected =
      '83' +
      '01' +
      '01' +
      '81' +
      '84' +
      '4180' +
      'd9985a' +
      '8a' +
      '01' +
      '00' +
      '00' +
      '40' +
      '40' +
      '40' +
      '00' +
      'f6' +
      '00' +
      'f6' +
      '5820' +
      '01'.repeat(32) +
      '5820' +
      '02'.repeat(32);
    expect(HexConverter.encode(view.toCBOR())).toEqual(expected);
    expect(HexConverter.encode(PartitionView.fromCBOR(view.toCBOR()).toCBOR())).toEqual(expected);
  });

  describe.each([
    ['shards-1.cbor', 0],
    ['shards-4.cbor', 2],
    ['shards-8.cbor', 3],
  ])('Go golden vector %s', (name, bits) => {
    it('matches the pinned checksum and round-trips byte-identically', () => {
      const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as {
        partitionId: number;
        sha256: Record<string, string>;
        version: number;
      };
      const bytes = file(name);
      expect(manifest.version).toEqual(1);
      expect(sha256Hex(bytes)).toEqual(manifest.sha256[name]);

      const view = PartitionView.fromCBOR(bytes);
      expect(view.version).toEqual(1n);
      expect(view.partitionId).toEqual(BigInt(manifest.partitionId));
      expect(view.partitionId).toEqual(PARTITION);
      expect(view.leaves).toHaveLength(1 << bits);
      expect(HexConverter.encode(view.toCBOR())).toEqual(HexConverter.encode(bytes));
    });

    it('is in canonical order with uint64 above the JS safe integer preserved', () => {
      const view = PartitionView.fromCBOR(file(name));
      expect(view.leaves.map((l) => l.shardId.toString())).toEqual(
        PartitionView.canonicalShardOrder(scheme(bits)).map((id) => id.toString()),
      );
      view.leaves.forEach((leaf, i) => {
        expect(leaf.inputRecord.sumOfEarnedFees).toEqual(2n ** 53n + BigInt(i));
        expect(leaf.inputRecord.roundNumber).toEqual(100n + BigInt(i));
        expect(leaf.inputRecord.epoch).toEqual(BigInt(i % 2));
        expect(leaf.inputRecord.summaryValue).toEqual(new Uint8Array(0));
      });
      if (view.leaves.length > 1) {
        // unchanged state: previous hash is state hash, no block hash
        const unchanged = view.leaves[1].inputRecord;
        expect(unchanged.previousHash).toEqual(unchanged.hash);
        expect(unchanged.blockHash).toBeNull();
      }
    });
  });

  describe('strict decoding', () => {
    const good = file('shards-4.cbor');
    const bad = (mutate: (b: number[]) => number[]): Uint8Array => new Uint8Array(mutate(Array.from(good)));

    it.each([
      ['trailing bytes', bad((b) => [...b, 0])],
      ['truncated', good.slice(0, good.length - 1)],
      ['empty', new Uint8Array(0)],
      ['null', new Uint8Array([0xf6])],
      ['empty array', new Uint8Array([0x80])],
      ['four items', bad((b) => [0x84, ...b.slice(1), 0x00])],
      ['indefinite length array', bad((b) => [0x9f, ...b.slice(1), 0xff])],
      ['non canonical version integer', bad((b) => [0x83, 0x18, 0x01, ...b.slice(2)])],
      ['tagged', new Uint8Array([0xd9, 0x9a, 0x5a, ...good])],
      ['huge declared array', new Uint8Array([0x83, 0x01, 0x01, 0x9b, 0, 0, 0, 1, 0, 0, 0, 0])],
    ])('rejects %s as malformed', (_name, data) => {
      expectReasonSync(() => PartitionView.fromCBOR(data), 'malformed');
    });

    it('does not default or accept other versions', () => {
      expectReasonSync(() => PartitionView.fromCBOR(bad((b) => [b[0], 0, ...b.slice(2)])), 'unsupported_version');
      expectReasonSync(() => PartitionView.fromCBOR(bad((b) => [b[0], 2, ...b.slice(2)])), 'unsupported_version');
    });

    it('requires the shard id to be an end marked byte string', () => {
      const i = Array.from(good).findIndex((_, k) => good[k] === 0x84 && good[k + 1] === 0x41);
      expect(i).toBeGreaterThan(0);
      // unsigned integer instead of bstr
      expectReasonSync(
        () => PartitionView.fromCBOR(bad((b) => [...b.slice(0, i + 1), 0x01, ...b.slice(i + 3)])),
        'malformed',
      );
      // no end marker bit
      expectReasonSync(() => PartitionView.fromCBOR(bad((b) => b.map((v, k) => (k === i + 2 ? 0 : v)))), 'malformed');
    });

    it('rejects an oversize view before decoding', () => {
      expectReasonSync(() => PartitionView.fromCBOR(new Uint8Array(PartitionView.MAX_BYTES + 1)), 'bounds');
    });

    it('rejects a view with a zero or out of range partition and wrong leaf counts', () => {
      expectReasonSync(() => PartitionView.fromCBOR(bad((b) => [...b.slice(0, 2), 0, ...b.slice(7)])), 'bounds');
      const view = PartitionView.fromCBOR(good);
      expectReasonSync(() => new PartitionView(0n, view.leaves), 'bounds');
      expectReasonSync(() => new PartitionView(1n << 32n, view.leaves), 'bounds');
      expectReasonSync(() => new PartitionView(1n, []), 'bounds');
      expectReasonSync(() => new PartitionView(1n, [...view.leaves, ...view.leaves, ...view.leaves]), 'bounds');
    });

    it('distinguishes null and empty input record fields', () => {
      const view = PartitionView.fromCBOR(file('shards-4.cbor'));
      const unchanged = view.leaves[1].inputRecord;
      expect(unchanged.blockHash).toBeNull();
      expect(unchanged.executedTransactionsHash).toBeNull();
      const empty = withLeaf(
        view,
        1,
        (l) =>
          // empty (not null) block hash on unchanged state is the same "nil" for validation but a different encoding
          new PartitionViewLeaf(
            l.shardId,
            irWith(l.inputRecord, { blockHash: new Uint8Array(0) }),
            l.technicalRecordHash,
            l.shardConfigurationHash,
          ),
      );
      const decoded = PartitionView.fromCBOR(empty.toCBOR());
      expect(decoded.leaves[1].inputRecord.blockHash).toEqual(new Uint8Array(0));
      expect(HexConverter.encode(decoded.toCBOR())).not.toEqual(HexConverter.encode(view.toCBOR()));
    });
  });

  describe('bounds', () => {
    const view = PartitionView.fromCBOR(file('shards-4.cbor'));
    const change =
      (f: (l: PartitionViewLeaf) => PartitionViewLeaf): (() => unknown) =>
      (): unknown =>
        withLeaf(view, 0, f);
    const leaf = (
      l: PartitionViewLeaf,
      ir: Partial<Record<string, bigint | Uint8Array | null>>,
      tr = l.technicalRecordHash,
      conf = l.shardConfigurationHash,
    ): PartitionViewLeaf => new PartitionViewLeaf(l.shardId, irWith(l.inputRecord, ir), tr, conf);

    it.each([
      ['short TRHash', (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, {}, new Uint8Array(31))],
      ['empty TRHash', (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, {}, new Uint8Array(0))],
      [
        'long ShardConfHash',
        (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, {}, l.technicalRecordHash, new Uint8Array(33)),
      ],
      ['partial state hash', (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, { hash: new Uint8Array([1]) })],
      [
        'partial ETHash',
        (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, { executedTransactionsHash: new Uint8Array(31) }),
      ],
      [
        'long summary value',
        (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, { summaryValue: new Uint8Array(257) }),
      ],
      ['changed state without block hash', (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, { blockHash: null })],
      ['unassigned timestamp', (l: PartitionViewLeaf): PartitionViewLeaf => leaf(l, { timestamp: 0n })],
    ])('rejects %s', (_name, f) => {
      expectReasonSync(change(f), 'bounds');
    });

    it('accepts the largest summary value', () => {
      expect(change((l) => leaf(l, { summaryValue: new Uint8Array(256) }))).not.toThrow();
    });

    it('rejects a shard id longer than 256 bits', () => {
      const long = shardIdOf('1'.repeat(257));
      expectReasonSync(
        () =>
          withLeaf(
            view,
            0,
            (l) => new PartitionViewLeaf(long, l.inputRecord, l.technicalRecordHash, l.shardConfigurationHash),
          ),
        'bounds',
      );
    });
  });
});

describe('canonical shard order', () => {
  it('orders left to right', () => {
    expect(PartitionView.canonicalShardOrder(scheme(2).reverse()).map(String)).toEqual(['00', '01', '10', '11']);
    expect(PartitionView.canonicalShardOrder(scheme(3).reverse()).map(String)).toEqual([
      '000',
      '001',
      '010',
      '011',
      '100',
      '101',
      '110',
      '111',
    ]);
    expect(PartitionView.canonicalShardOrder([shardIdOf('1'), shardIdOf('01'), shardIdOf('00')]).map(String)).toEqual([
      '00',
      '01',
      '1',
    ]);
  });

  it('yields the empty id for a single shard partition, encoded as 80', () => {
    const order = PartitionView.canonicalShardOrder([]);
    expect(order).toHaveLength(1);
    expect(HexConverter.encode(order[0].encode())).toEqual('80');
  });

  it.each([
    ['one element scheme', [shardIdOf('0')]],
    ['empty id in a scheme', [shardIdOf(''), shardIdOf('0')]],
    ['duplicate', [shardIdOf('0'), shardIdOf('0')]],
    ['overlap', [shardIdOf('0'), shardIdOf('01'), shardIdOf('1')]],
    ['gap', [shardIdOf('00'), shardIdOf('01'), shardIdOf('10')]],
    ['too many', scheme(4)],
  ])('rejects %s', (_name, s) => {
    expectReasonSync(() => PartitionView.canonicalShardOrder(s), 'topology');
  });
});

describe('PartitionView candidate structure', () => {
  const view = PartitionView.fromCBOR(file('shards-4.cbor'));
  const v = assemblyVector(4);
  const pins = topologyOf(v, 2);

  it('validates a complete canonical candidate without any external topology', () => {
    expect(() => view.validateStructure(PARTITION)).not.toThrow();
    expect(view.scheme.map(String)).toEqual(['00', '01', '10', '11']);
    expect(() => view.validateStructure(PARTITION, pins)).not.toThrow();
    const single = PartitionView.fromCBOR(file('shards-1.cbor'));
    expect(single.scheme).toEqual([]);
    expect(() => single.validateStructure(PARTITION)).not.toThrow();
  });

  it('rejects a wrong partition', () => {
    expectReasonSync(() => view.validateStructure(PARTITION + 1n), 'topology');
  });

  it('rejects incomplete, overlapping, duplicate and reordered candidates', () => {
    const leaves = view.leaves;
    const bad =
      (l: PartitionViewLeaf[]): (() => void) =>
      (): void =>
        new PartitionView(view.partitionId, l).validateStructure(PARTITION);
    expectReasonSync(bad([leaves[1], leaves[0], leaves[2], leaves[3]]), 'topology');
    expectReasonSync(bad(leaves.slice(0, 3)), 'topology');
    expectReasonSync(bad([leaves[0], leaves[0], leaves[2], leaves[3]]), 'topology');
    expectReasonSync(bad([leaves[0]]), 'topology');
    expectReasonSync(bad([leaves[0], leaves[1]]), 'topology');
  });

  it('applies pinned scheme and configuration hashes as an optional stricter policy', () => {
    expectReasonSync(() => view.validateStructure(PARTITION, { ...pins, scheme: scheme(3) }), 'topology');
    expectReasonSync(() => view.validateStructure(PARTITION, { ...pins, scheme: [] }), 'topology');
    const bad = pins.shardConfigurationPins.map((p) =>
      p.shard.toString() === '01' ? { hash: new Uint8Array(32).fill(7), shard: p.shard } : p,
    );
    expectReasonSync(() => view.validateStructure(PARTITION, { shardConfigurationPins: bad }), 'config_not_admitted');
    // absent pins do not constrain
    expect(() => view.validateStructure(PARTITION, { shardConfigurationPins: [] })).not.toThrow();
    // a pin that would never be consulted is an error, not silently ignored
    const stray = { hash: new Uint8Array(32), shard: shardIdOf('0') };
    expectReasonSync(() => view.validateStructure(PARTITION, { shardConfigurationPins: [stray] }), 'topology');
    expectReasonSync(
      () =>
        view.validateStructure(PARTITION, {
          shardConfigurationPins: [pins.shardConfigurationPins[0], pins.shardConfigurationPins[0]],
        }),
      'topology',
    );
    expectReasonSync(
      () =>
        view.validateStructure(PARTITION, {
          shardConfigurationPins: [{ hash: new Uint8Array(31), shard: pins.shardConfigurationPins[0].shard }],
        }),
      'bounds',
    );
  });
});

describe.each([
  [1, 0],
  [4, 2],
  [8, 3],
  ['4-initial', 2],
])('assembly of %s shards against Go', (shards, bits) => {
  const v = assemblyVector(shards);
  const view = PartitionView.fromCBOR(HexConverter.decode(v.view));
  const topology = topologyOf(v, bits);
  const enclosing = PartitionView.decodeEnclosingCertificate(HexConverter.decode(v.enclosingUc));

  it('rebuilds the same shard tree as Go', async () => {
    const tree = await view.checkCommitmentUnauthenticated(enclosing, PARTITION, topology);
    expect(HexConverter.encode(tree.rootHash)).toEqual(v.shardTreeRoot);
  });

  it('derives byte-identical ordinary unicity certificates and verifies each one fully', async () => {
    const session = newSession(trustBaseOf(v));
    const ucs = await assembleVia(view, enclosing, session);
    expect(ucs.map((uc) => HexConverter.encode(uc.toCBOR()))).toEqual(v.shards.map((s) => s.uc));
    expect(ucs.map((uc) => uc.shardTreeCertificate.shard.toString())).toEqual(v.shards.map((s) => s.shard));

    for (const uc of ucs) {
      expect((await UnicitySealHashMatchesWithRootHashRule.verify(uc)).status).toEqual(VerificationStatus.OK);
      expect(uc.unicitySeal.toCBOR()).toEqual(enclosing.unicitySeal.toCBOR());
      expect(uc.unicityTreeCertificate.toCBOR()).toEqual(enclosing.unicityTreeCertificate.toCBOR());
      // the independent Go check of the same bytes
      expect(HexConverter.encode(UnicityCertificate.fromCBOR(uc.toCBOR()).toCBOR())).toEqual(
        HexConverter.encode(uc.toCBOR()),
      );
    }
    expect(session.stats.quorumChecks).toEqual(1);
  });

  it('preserves null versus empty native IR fields', () => {
    expect(HexConverter.encode(view.toCBOR())).toEqual(v.view);
    if (shards === '4-initial') {
      const initial = view.leaves[1].inputRecord;
      expect(initial.nullableHash).toBeNull();
      expect(initial.nullableSummaryValue).toBeNull();
      expect(initial.previousHash).toBeNull();
      expect(view.leaves[0].inputRecord.nullableSummaryValue).toEqual(new Uint8Array(0));
    }
  });

  it('does not modify the inputs', async () => {
    const before = HexConverter.encode(view.toCBOR());
    await assembleVia(view, enclosing, newSession(trustBaseOf(v)));
    expect(HexConverter.encode(view.toCBOR())).toEqual(before);
  });

  it('needs no pinned topology: the committed scheme and hashes come from the authenticated seal', async () => {
    const authenticated = await new PartitionViewAuthenticator(PARTITION, newSession(trustBaseOf(v))).authenticate(
      view,
      enclosing,
    );
    expect(authenticated.scheme.map(String)).toEqual(scheme(bits).map(String));
    expect(authenticated.leaves).toHaveLength(1 << bits);
    expect(authenticated.partitionId).toEqual(PARTITION);
    expect(authenticated.networkId.id).toEqual(v.networkId);
    expect(HexConverter.encode(authenticated.seal.toCBOR())).toEqual(
      HexConverter.encode(enclosing.unicitySeal.toCBOR()),
    );
  });

  it('applies matching pins and rejects mismatching ones', async () => {
    await expect(assembleVia(view, enclosing, newSession(trustBaseOf(v)), topology)).resolves.toHaveLength(1 << bits);
    const wrong = [{ hash: new Uint8Array(32).fill(1), shard: view.leaves[0].shardId }];
    await expectReason(
      assembleVia(view, enclosing, newSession(trustBaseOf(v)), { shardConfigurationPins: wrong }),
      'config_not_admitted',
    );
  });

  it('refuses seals of another network or epoch even though the same keys sign', async () => {
    await expectReason(assembleVia(view, enclosing, newSession(trustBaseOf(v, { networkId: 2 }))), 'seal_invalid');
    await expectReason(
      assembleVia(view, enclosing, newSession(trustBaseOf(v, { epoch: v.epoch + 1 }))),
      'seal_invalid',
    );
  });

  it('refuses an unknown authority', async () => {
    const other = '02' + '11'.repeat(32);
    await expectReason(assembleVia(view, enclosing, newSession(trustBaseOf(v, { sigKey: other }))), 'seal_invalid');
  });
});

describe('PartitionView seal structure', () => {
  it('rejects the enclosing certificate of a seal that fails native structural validation', async () => {
    const v = assemblyVector(4);
    const view = PartitionView.fromCBOR(HexConverter.decode(v.view));
    const enclosing = PartitionView.decodeEnclosingCertificate(HexConverter.decode(v.enclosingUc));
    const old = new UnicityCertificate(
      enclosing.inputRecord,
      enclosing.technicalRecordHash,
      enclosing.shardConfigurationHash,
      enclosing.shardTreeCertificate,
      enclosing.unicityTreeCertificate,
      UnicitySeal.fromCBOR(
        replaceItem(enclosing.unicitySeal.toCBOR(), 4, CborSerializer.encodeUnsignedInteger(1), true),
      ),
    );
    await expectReason(view.checkCommitmentUnauthenticated(old, PARTITION), 'seal_invalid');
  });

  it('rejects a leaf with a null summary value on a non-initial record', () => {
    const v = assemblyVector('4-initial');
    const view = PartitionView.fromCBOR(HexConverter.decode(v.view));
    expectReasonSync(
      () =>
        withLeaf(
          view,
          1,
          (l) =>
            new PartitionViewLeaf(
              l.shardId,
              irWith(l.inputRecord, { roundNumber: 1n, timestamp: 1n }),
              l.technicalRecordHash,
              l.shardConfigurationHash,
            ),
        ),
      'bounds',
    );
  });
});

describe('PartitionView adversarial assembly', () => {
  const v = assemblyVector(4);
  const view = PartitionView.fromCBOR(HexConverter.decode(v.view));
  const enclosingBytes = HexConverter.decode(v.enclosingUc);
  const enclosing = PartitionView.decodeEnclosingCertificate(enclosingBytes);
  const assemble = (pv: PartitionView, uc: UnicityCertificate): Promise<UnicityCertificate[]> =>
    assembleVia(pv, uc, newSession(trustBaseOf(v)));

  it('is accepted unchanged', async () => {
    await expect(assemble(view, enclosing)).resolves.toHaveLength(4);
  });

  it('rejects a flip of every committed field of every leaf', async () => {
    const flips: Record<string, (l: PartitionViewLeaf) => PartitionViewLeaf> = {
      blockHash: (l) => withIr(l, { blockHash: new Uint8Array(32).fill(9) }),
      epoch: (l) => withIr(l, { epoch: l.inputRecord.epoch + 1n }),
      executedTransactionsHash: (l) => withIr(l, { executedTransactionsHash: new Uint8Array(32).fill(9) }),
      fees: (l) => withIr(l, { sumOfEarnedFees: l.inputRecord.sumOfEarnedFees + 1n }),
      hash: (l) => withIr(l, { hash: flipFirst(l.inputRecord.hash) }),
      previousHash: (l) => withIr(l, { previousHash: flipFirst(l.inputRecord.previousHash as Uint8Array) }),
      round: (l) => withIr(l, { roundNumber: l.inputRecord.roundNumber + 1n }),
      summary: (l) => withIr(l, { summaryValue: new Uint8Array([1]) }),
      timestamp: (l) => withIr(l, { timestamp: l.inputRecord.timestamp + 1n }),
      trHash: (l) =>
        new PartitionViewLeaf(l.shardId, l.inputRecord, flipFirst(l.technicalRecordHash), l.shardConfigurationHash),
    };
    const withIr = (
      l: PartitionViewLeaf,
      change: Partial<Record<string, bigint | Uint8Array | null>>,
    ): PartitionViewLeaf =>
      new PartitionViewLeaf(l.shardId, irWith(l.inputRecord, change), l.technicalRecordHash, l.shardConfigurationHash);
    const flipFirst = (b: Uint8Array): Uint8Array => {
      const c = new Uint8Array(b);
      c[0] ^= 1;
      return c;
    };

    for (const [name, flip] of Object.entries(flips)) {
      for (let i = 0; i < 4; i++) {
        let mutated: PartitionView;
        try {
          mutated = withLeaf(view, i, flip);
        } catch (e) {
          // rejected already by the bounds
          expect(e).toBeInstanceOf(PartitionViewError);
          continue;
        }
        await expect(assemble(mutated, enclosing)).rejects.toBeInstanceOf(PartitionViewError);
        void name;
      }
    }
    // a changed configuration hash changes the committed tree
    await expectReason(
      assemble(
        withLeaf(
          view,
          1,
          (l) => new PartitionViewLeaf(l.shardId, l.inputRecord, l.technicalRecordHash, new Uint8Array(32).fill(3)),
        ),
        enclosing,
      ),
      'enclosing_certificate_mismatch',
    );
  });

  it('rejects another partition certificate and a tampered partition path', async () => {
    const utc = enclosing.unicityTreeCertificate;
    const steps = CborDeserializer.decodeArray(
      CborDeserializer.decodeArray(CborDeserializer.decodeTag(utc.toCBOR()).data)[2],
    );
    expect(steps).toHaveLength(1);
    const key = CborDeserializer.decodeArray(steps[0])[0];

    const tampered = UnicityTreeCertificate.fromCBOR(
      replaceItem(
        utc.toCBOR(),
        2,
        CborSerializer.encodeArray(
          CborSerializer.encodeArray(key, CborSerializer.encodeByteString(new Uint8Array(32).fill(5))),
        ),
        true,
      ),
    );
    const withUtc = (u: UnicityTreeCertificate): UnicityCertificate =>
      new UnicityCertificate(
        enclosing.inputRecord,
        enclosing.technicalRecordHash,
        enclosing.shardConfigurationHash,
        enclosing.shardTreeCertificate,
        u,
        enclosing.unicitySeal,
      );
    await expectReason(assemble(view, withUtc(tampered)), 'tree_mismatch');

    const otherPartition = UnicityTreeCertificate.fromCBOR(
      replaceItem(utc.toCBOR(), 1, CborSerializer.encodeUnsignedInteger(0x01010101), true),
    );
    await expectReason(assemble(view, withUtc(otherPartition)), 'tree_mismatch');
  });

  it('rejects every altered seal field', async () => {
    const sealBytes = enclosing.unicitySeal.toCBOR();
    const mutations: Record<string, Uint8Array> = {
      hash: replaceItem(sealBytes, 6, CborSerializer.encodeByteString(new Uint8Array(32).fill(1)), true),
      network: replaceItem(sealBytes, 1, CborSerializer.encodeUnsignedInteger(2), true),
      previous: replaceItem(sealBytes, 5, CborSerializer.encodeByteString(new Uint8Array(32).fill(1)), true),
      round: replaceItem(
        sealBytes,
        2,
        CborSerializer.encodeUnsignedInteger(enclosing.unicitySeal.rootChainRoundNumber + 1n),
        true,
      ),
      timestamp: replaceItem(
        sealBytes,
        4,
        CborSerializer.encodeUnsignedInteger(enclosing.unicitySeal.timestamp + 1n),
        true,
      ),
    };
    for (const [name, bytes] of Object.entries(mutations)) {
      const uc = new UnicityCertificate(
        enclosing.inputRecord,
        enclosing.technicalRecordHash,
        enclosing.shardConfigurationHash,
        enclosing.shardTreeCertificate,
        enclosing.unicityTreeCertificate,
        UnicitySeal.fromCBOR(bytes),
      );
      await expect(assemble(view, uc)).rejects.toBeInstanceOf(PartitionViewError);
      void name;
    }
  });

  it('rejects altered or missing signatures', async () => {
    const sealBytes = enclosing.unicitySeal.toCBOR();
    const resealed = (map: Uint8Array): UnicityCertificate =>
      new UnicityCertificate(
        enclosing.inputRecord,
        enclosing.technicalRecordHash,
        enclosing.shardConfigurationHash,
        enclosing.shardTreeCertificate,
        enclosing.unicityTreeCertificate,
        UnicitySeal.fromCBOR(replaceItem(sealBytes, 7, map, true)),
      );
    // the native decoder does not accept a seal without a signature map at all
    expect(() => resealed(CborSerializer.encodeNull())).toThrow();
    const [signer, signature] = Array.from(enclosing.unicitySeal.signatures?.entries() ?? [])[0];
    const altered = signature.toCBOR();
    altered[altered.length - 10] ^= 1;
    await expectReason(
      assemble(
        view,
        resealed(
          CborSerializer.encodeMap(new CborMap([new CborMapEntry(CborSerializer.encodeTextString(signer), altered)])),
        ),
      ),
      'seal_invalid',
    );
    const emptyMap = new Uint8Array([0xa0]);
    await expectReason(assemble(view, resealed(emptyMap)), 'seal_invalid');
  });

  it('rejects a mismatching enclosing leaf', async () => {
    const ucWith = (parts: Partial<{ conf: Uint8Array; ir: InputRecord; tr: Uint8Array | null }>): UnicityCertificate =>
      new UnicityCertificate(
        parts.ir ?? enclosing.inputRecord,
        parts.tr === undefined ? enclosing.technicalRecordHash : parts.tr,
        parts.conf ?? enclosing.shardConfigurationHash,
        enclosing.shardTreeCertificate,
        enclosing.unicityTreeCertificate,
        enclosing.unicitySeal,
      );
    await expectReason(
      assemble(
        view,
        ucWith({ ir: irWith(enclosing.inputRecord, { timestamp: enclosing.inputRecord.timestamp + 1n }) }),
      ),
      'enclosing_certificate_mismatch',
    );
    await expectReason(assemble(view, ucWith({ tr: new Uint8Array(32).fill(1) })), 'enclosing_certificate_mismatch');
    await expectReason(assemble(view, ucWith({ tr: null })), 'enclosing_certificate_mismatch');
    await expectReason(assemble(view, ucWith({ conf: new Uint8Array(32).fill(1) })), 'enclosing_certificate_mismatch');
  });

  it('rejects an enclosing shard path that does not match the view', async () => {
    const stc = replaceItem(
      enclosing.shardTreeCertificate.toCBOR(),
      2,
      CborSerializer.encodeArray(
        CborSerializer.encodeByteString(new Uint8Array(32).fill(1)),
        CborSerializer.encodeByteString(new Uint8Array(32).fill(2)),
      ),
      true,
    );
    const uc = new UnicityCertificate(
      enclosing.inputRecord,
      enclosing.technicalRecordHash,
      enclosing.shardConfigurationHash,

      (await import('../../../../src/api/bft/ShardTreeCertificate.js')).ShardTreeCertificate.fromCBOR(stc),
      enclosing.unicityTreeCertificate,
      enclosing.unicitySeal,
    );
    await expectReason(assemble(view, uc), 'enclosing_certificate_mismatch');
  });

  it('rejects an enclosing certificate of a shard that is not in the view', async () => {
    const stc = (await import('../../../../src/api/bft/ShardTreeCertificate.js')).ShardTreeCertificate;
    const uc = new UnicityCertificate(
      enclosing.inputRecord,
      enclosing.technicalRecordHash,
      enclosing.shardConfigurationHash,
      new stc(shardIdOf('0'), [new Uint8Array(32)]),
      enclosing.unicityTreeCertificate,
      enclosing.unicitySeal,
    );
    await expectReason(assemble(view, uc), 'enclosing_certificate_mismatch');
  });

  it('rejects a nil partition path step without crashing', async () => {
    const utc = new UnicityTreeCertificate(enclosing.unicityTreeCertificate.partitionIdentifier, [null as never]);
    const uc = new UnicityCertificate(
      enclosing.inputRecord,
      enclosing.technicalRecordHash,
      enclosing.shardConfigurationHash,
      enclosing.shardTreeCertificate,
      utc,
      enclosing.unicitySeal,
    );
    await expectReason(assemble(view, uc), 'tree_mismatch');
  });

  it('rejects a non canonical or undecodable enclosing certificate', () => {
    expectReasonSync(() => PartitionView.decodeEnclosingCertificate(new Uint8Array([0xf6])), 'malformed');
    expectReasonSync(
      () => PartitionView.decodeEnclosingCertificate(new Uint8Array([...enclosingBytes, 0])),
      'malformed',
    );
  });
});
