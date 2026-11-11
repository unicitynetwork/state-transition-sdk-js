import { secp256k1 } from '@noble/curves/secp256k1.js';

import {
  buildEntry,
  IEntryFields,
  loadVectors,
  parseEntryFields,
  replaceBytes,
  vectorEntry,
} from './TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseEncodingError, TrustBaseInvalidError } from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

const GENESIS = (): IEntryFields => parseEntryFields(vectorEntry('genesis'));
const EPOCH2 = (): IEntryFields => parseEntryFields(vectorEntry('epoch2-signed-abc'));

function withMembers(count: number, base: IEntryFields): IEntryFields {
  const members: [string, Uint8Array, bigint][] = [];
  for (let i = 0; i < count; i++) {
    const secret = new Uint8Array(32);
    secret[30] = Math.floor((i + 1) / 256);
    secret[31] = (i + 1) % 256;
    members.push([`n${i.toString().padStart(4, '0')}`, secp256k1.getPublicKey(secret, true), 1n]);
  }
  return { ...base, members, quorum: BigInt(Math.floor((count * 2) / 3) + 1) };
}

function expectInvalid(fields: IEntryFields, message?: RegExp): void {
  expect(() => RootTrustBaseV2.decode(buildEntry(fields))).toThrow(TrustBaseInvalidError);
  if (message) {
    expect(() => RootTrustBaseV2.decode(buildEntry(fields))).toThrow(message);
  }
}

function expectEncoding(bytes: Uint8Array, message?: RegExp): void {
  expect(() => RootTrustBaseV2.decode(bytes)).toThrow(TrustBaseEncodingError);
  if (message) {
    expect(() => RootTrustBaseV2.decode(bytes)).toThrow(message);
  }
}

describe('RootTrustBaseV2: shared vectors', () => {
  const vectors = loadVectors();

  it.each(vectors.entries)(
    'entry $name: re-encodes to the vector bytes, with the vector sigBytes and entryId',
    async (vector) => {
      const entry = RootTrustBaseV2.decode(HexConverter.decode(vector.hex));
      expect(HexConverter.encode(entry.encode())).toEqual(vector.hex);
      expect(HexConverter.encode(entry.sigBytes())).toEqual(vector.sigBytes);
      expect(HexConverter.encode(await entry.entryId())).toEqual(vector.entryId);
    },
  );

  it.each(vectors.decode)('decode $name', (vector) => {
    const bytes = HexConverter.decode(vector.hex);
    if (vector.valid) {
      expect(() => RootTrustBaseV2.decode(bytes)).not.toThrow();
      return;
    }
    // The error class is part of the contract, not just the failure.
    expect(() => RootTrustBaseV2.decode(bytes)).toThrow(
      vector.errorClass === 'encoding' ? TrustBaseEncodingError : TrustBaseInvalidError,
    );
    expect(() => RootTrustBaseV2.decode(bytes)).not.toThrow(
      vector.errorClass === 'encoding' ? TrustBaseInvalidError : TrustBaseEncodingError,
    );
  });

  it('two signature sets over the same entry have one identity', async () => {
    const abc = RootTrustBaseV2.decode(vectorEntry('epoch2-signed-abc'));
    const abd = RootTrustBaseV2.decode(vectorEntry('epoch2-signed-abd'));
    expect(HexConverter.encode(abc.encode())).not.toEqual(HexConverter.encode(abd.encode()));
    expect(HexConverter.encode(await abc.entryId())).toEqual(HexConverter.encode(await abd.entryId()));
  });

  it('reads the fields of the genesis and of a successor', () => {
    const genesis = RootTrustBaseV2.decode(vectorEntry('genesis'));
    expect(genesis.isGenesis()).toBe(true);
    expect(genesis.signatures).toBeNull();
    expect(genesis.networkId.id).toBe(5);
    expect(genesis.members.map((m) => [m.nodeId, m.weight])).toEqual([
      ['a', 1n],
      ['b', 1n],
      ['c', 1n],
      ['d', 1n],
    ]);
    expect(genesis.quorumThreshold).toBe(3n);
    expect(genesis.totalWeight).toBe(4n);

    const next = RootTrustBaseV2.decode(vectorEntry('epoch2-signed-abc'));
    expect(next.isGenesis()).toBe(false);
    expect(next.epoch).toBe(2n);
    expect(Array.from(next.signatures?.keys() ?? [])).toEqual(['a', 'b', 'c']);
  });

  it('hands out copies, not its own arrays', () => {
    const entry = RootTrustBaseV2.decode(vectorEntry('epoch2-signed-abc'));
    const before = HexConverter.encode(entry.encode());
    entry.members[0].sigKey.fill(0);
    entry.previousEntryId.fill(0);
    entry.stateHash?.fill(0);
    entry.signatures?.get('a')?.fill(0);
    entry.signatures?.clear();
    expect(HexConverter.encode(entry.encode())).toEqual(before);
  });
});

describe('RootTrustBaseV2: structure rules, one at a time', () => {
  it('control: the unchanged fields are accepted, so every failure below is its own rule', () => {
    expect(() => RootTrustBaseV2.decode(buildEntry(GENESIS()))).not.toThrow();
    expect(() => RootTrustBaseV2.decode(buildEntry(EPOCH2()))).not.toThrow();
  });

  it('rejects epoch zero', () => expectInvalid({ ...GENESIS(), epoch: 0n }));

  it('rejects an empty member list', () => expectInvalid({ ...GENESIS(), members: [], quorum: 1n }));

  it('accepts 256 members and rejects 257 as a rule, 273 as an encoding bound', () => {
    expect(() => RootTrustBaseV2.decode(buildEntry(withMembers(256, GENESIS())))).not.toThrow();
    expectInvalid(withMembers(257, GENESIS()));
    expectEncoding(buildEntry(withMembers(273, GENESIS())));
  });

  it('rejects members that are not sorted by node id', () => {
    const f = GENESIS();
    expectInvalid({ ...f, members: [f.members[1], f.members[0], f.members[2], f.members[3]] });
  });

  it('rejects a repeated node id even with different keys', () => {
    const f = GENESIS();
    expectInvalid(
      { ...f, members: [f.members[0], ['a', f.members[1][1], 1n], f.members[2], f.members[3]] },
      /not strictly sorted/,
    );
  });

  it('sorts node ids by their bytes, not by UTF-16 code units', () => {
    // U+FF5E (UTF-8 EF BD 9E) sorts after U+1F600 (F0 9F 98 80) by UTF-16 units but before it by bytes.
    const f = GENESIS();
    const key = (i: number): Uint8Array => f.members[i][1];
    const ordered: [string, Uint8Array, bigint][] = [
      ['～', key(0), 1n],
      ['\u{1f600}', key(1), 1n],
      ['\u{1f601}', key(2), 1n],
      ['\u{1f602}', key(3), 1n],
    ];
    expect(() => RootTrustBaseV2.decode(buildEntry({ ...f, members: ordered }))).not.toThrow();
    expectInvalid({ ...f, members: [ordered[1], ordered[0], ordered[2], ordered[3]] });
  });

  it('rejects an empty node id and one longer than 128 bytes', () => {
    const f = GENESIS();
    expectInvalid({ ...f, members: [['', f.members[0][1], 1n], f.members[1], f.members[2], f.members[3]] });
    expect(() =>
      RootTrustBaseV2.decode(
        buildEntry({
          ...f,
          members: [
            ['a'.repeat(128), f.members[0][1], 1n],
            ['b', f.members[1][1], 1n],
            ['c', f.members[2][1], 1n],
            ['d', f.members[3][1], 1n],
          ],
        }),
      ),
    ).not.toThrow();
    expectInvalid({
      ...f,
      members: [['a'.repeat(129), f.members[0][1], 1n], f.members[1], f.members[2], f.members[3]],
    });
  });

  it('rejects a weight of zero and one above 2^40, and accepts exactly 2^40', () => {
    const f = GENESIS();
    expectInvalid({
      ...f,
      members: [['a', f.members[0][1], 0n], f.members[1], f.members[2], f.members[3]],
      quorum: 3n,
    });
    // a weight above 2^40 with the quorum threshold that matches it: only the weight rule can reject this entry
    const heavy = (1n << 40n) + 1n;
    expectInvalid(
      {
        ...f,
        members: [['a', f.members[0][1], heavy], f.members[1], f.members[2], f.members[3]],
        quorum: ((heavy + 3n) * 2n) / 3n + 1n,
      },
      /weight/,
    );
    const total = (1n << 40n) + 3n;
    expect(() =>
      RootTrustBaseV2.decode(
        buildEntry({
          ...f,
          members: [['a', f.members[0][1], 1n << 40n], f.members[1], f.members[2], f.members[3]],
          quorum: (total * 2n) / 3n + 1n,
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a signing key that is not a compressed secp256k1 point', () => {
    const f = GENESIS();
    const withKey = (key: Uint8Array): IEntryFields => ({
      ...f,
      members: [['a', key, 1n], f.members[1], f.members[2], f.members[3]],
    });
    const good = f.members[0][1];
    expectInvalid(withKey(good.slice(0, 32)));
    expectInvalid(withKey(new Uint8Array([0x04, ...good.slice(1)])));
    expectInvalid(withKey(new Uint8Array([good[0], ...new Uint8Array(32).fill(0xff)])));
    expectInvalid(withKey(new Uint8Array(33)));
    // a valid point in its 65-byte uncompressed form is not accepted: only the 33-byte compressed form is
    const secret = new Uint8Array(32).fill(1);
    expect(secp256k1.getPublicKey(secret, true)).toEqual(good);
    expectInvalid(withKey(secp256k1.getPublicKey(secret, false)), /not a compressed secp256k1 key/);
  });

  it('rejects two members that share a signing key', () => {
    const f = GENESIS();
    expectInvalid({ ...f, members: [f.members[0], ['b', f.members[0][1], 1n], f.members[2], f.members[3]] });
  });

  it('rejects any quorum threshold but floor(2W/3)+1', () => {
    const f = GENESIS();
    for (const quorum of [0n, 2n, 4n, 5n]) {
      expectInvalid({ ...f, quorum });
    }
    // The rule follows the total weight, not the member count.
    const weighted = parseEntryFields(vectorEntry('weighted-genesis-5-1-1-1'));
    expect(weighted.quorum).toBe(6n);
    expectInvalid({ ...weighted, quorum: 5n });
  });

  it('rejects a hash of the wrong length, for the state hash and the change record hash alike', () => {
    const f = GENESIS();
    expectInvalid({ ...f, stateHash: new Uint8Array(31).fill(1) });
    expectInvalid({ ...f, changeRecordHash: new Uint8Array(33).fill(1) });
    expectInvalid({ ...f, changeRecordHash: new Uint8Array(1).fill(1), stateHash: null });
  });

  it('writes an absent hash as null only, for both hashes', () => {
    const f = GENESIS();
    expectEncoding(buildEntry({ ...f, stateHash: new Uint8Array(0) }));
    expectEncoding(buildEntry({ ...f, changeRecordHash: new Uint8Array(0) }));
    expect(() => RootTrustBaseV2.decode(buildEntry({ ...f, changeRecordHash: null, stateHash: null }))).not.toThrow();
  });

  it('rejects a predecessor id that is not 32 bytes', () => {
    expectInvalid({ ...GENESIS(), previousEntryId: new Uint8Array(31) });
    expectInvalid({ ...EPOCH2(), previousEntryId: new Uint8Array(33).fill(7) });
  });

  it('treats a predecessor id as genesis only when all its bytes are zero', () => {
    const next = EPOCH2();
    const almost = new Uint8Array(32).fill(7);
    almost[0] = 0;
    // not a genesis: it needs signatures, and with them it is a well-formed successor
    expect(() => RootTrustBaseV2.decode(buildEntry({ ...next, previousEntryId: almost }))).not.toThrow();
    expect(RootTrustBaseV2.decode(buildEntry({ ...next, previousEntryId: almost })).isGenesis()).toBe(false);
    expectInvalid({ ...next, previousEntryId: almost, signatures: null }, /no signatures/);
  });

  it('bounds the signature map: 272 entries are read, 273 are an encoding error', () => {
    const next = EPOCH2();
    const sigs = (count: number): [string, Uint8Array][] =>
      Array.from({ length: count }, (_, i): [string, Uint8Array] => [
        `s${i.toString().padStart(4, '0')}`,
        new Uint8Array(65).fill(1),
      ]);
    expect(() => RootTrustBaseV2.decode(buildEntry({ ...next, signatures: sigs(272) }))).not.toThrow();
    expectEncoding(buildEntry({ ...next, signatures: sigs(273) }), /273 signatures exceed/);
  });

  it('ties the genesis shape to null signatures and the rest to a non-empty map', () => {
    const genesis = GENESIS();
    const next = EPOCH2();
    expectInvalid({ ...genesis, signatures: [['a', new Uint8Array(65).fill(1)]] });
    expectInvalid({ ...genesis, signatures: [] });
    expectInvalid({ ...next, signatures: null });
    expectInvalid({ ...next, signatures: [] });
  });
});

describe('RootTrustBaseV2: encoding rules, one at a time', () => {
  const genesis = (): Uint8Array => vectorEntry('genesis');

  it('rejects a version other than 2', () => {
    expectEncoding(buildEntry({ ...GENESIS(), version: 1n }), /Version 1, expected 2/);
    expectEncoding(buildEntry({ ...GENESIS(), version: 3n }), /Version 3, expected 2/);
  });

  it('network identifier 0 is an invalid entry (shared rule), above 16 bits a bad encoding', () => {
    expectInvalid({ ...GENESIS(), network: 0n }, /Network identifier is zero/);
    expectEncoding(buildEntry({ ...GENESIS(), network: 65536n }), /Network identifier 65536 above 65535/);
    expect(() => RootTrustBaseV2.decode(buildEntry({ ...GENESIS(), network: 65535n }))).not.toThrow();
  });

  it('rejects an integer that is not in its shortest form', () => {
    // epoch 1 written as 0x1801 instead of 0x01
    expectEncoding(replaceBytes(genesis(), '8a02050101', '8a020518' + '0101'));
  });

  it('rejects an indefinite-length array', () => {
    const bytes = genesis();
    const hex = HexConverter.encode(bytes).replace('d998588a', 'd998589f') + 'ff';
    expectEncoding(HexConverter.decode(hex));
  });

  it('rejects an entry with 9 or 11 fields, by the arity rule', () => {
    const bytes = genesis();
    const nine = HexConverter.encode(bytes).replace('d998588a', 'd9985889').slice(0, -2); // drop the trailing null signature field
    expectEncoding(HexConverter.decode(nine), /Expected 10 fields, got 9/);
    expectEncoding(
      HexConverter.decode(HexConverter.encode(bytes).replace('d998588a', 'd998588b') + 'f6'),
      /Expected 10 fields, got 11/,
    );
  });

  it('rejects trailing bytes, truncation, a wrong tag and a missing tag', () => {
    const bytes = genesis();
    expectEncoding(new Uint8Array([...bytes, 0]));
    expectEncoding(bytes.slice(0, bytes.length - 1));
    expectEncoding(replaceBytes(bytes, 'd998588a', 'd998598a'), /Tag 39001, expected 39000/);
    expectEncoding(bytes.slice(3));
  });

  it('rejects a signature map with duplicate or out-of-order keys', () => {
    const next = vectorEntry('epoch2-signed-abc');
    const f = parseEntryFields(next);
    const [first, second] = f.signatures ?? [];
    // Hand-assemble the map: the reference encoder sorts, so the test writes the bytes itself.
    const entry = (id: string, signature: Uint8Array): string =>
      '61' + HexConverter.encode(new TextEncoder().encode(id)) + '5841' + HexConverter.encode(signature);
    const hex = HexConverter.encode(next);
    const mapStart = hex.indexOf('a3' + entry('a', first[1]));
    const sorted = 'a3' + entry('a', first[1]) + entry('b', second[1]) + entry('c', (f.signatures ?? [])[2][1]);
    expect(hex.slice(mapStart)).toEqual(sorted);
    const duplicate = 'a3' + entry('a', first[1]) + entry('a', first[1]) + entry('c', (f.signatures ?? [])[2][1]);
    const reordered = 'a3' + entry('b', second[1]) + entry('a', first[1]) + entry('c', (f.signatures ?? [])[2][1]);
    expectEncoding(HexConverter.decode(hex.slice(0, mapStart) + duplicate));
    expectEncoding(HexConverter.decode(hex.slice(0, mapStart) + reordered));
  });

  it('rejects a signature that is not a byte string', () => {
    const next = vectorEntry('epoch2-signed-abc');
    const f = parseEntryFields(next);
    const signatures = f.signatures ?? [];
    const bytesEntry = (id: string, signature: Uint8Array): string =>
      '61' + HexConverter.encode(new TextEncoder().encode(id)) + '5841' + HexConverter.encode(signature);
    const hex = HexConverter.encode(next);
    const mapStart = hex.indexOf('a3' + bytesEntry('a', signatures[0][1]));
    const valid =
      'a3' + bytesEntry('a', signatures[0][1]) + bytesEntry('b', signatures[1][1]) + bytesEntry('c', signatures[2][1]);
    expect(hex.slice(mapStart)).toEqual(valid);
    const textValue = 'a3' + '6161' + '6178' + bytesEntry('b', signatures[1][1]) + bytesEntry('c', signatures[2][1]);
    expectEncoding(HexConverter.decode(hex.slice(0, mapStart) + textValue));
  });

  it('rejects a member weight that is not an integer', () => {
    const f = GENESIS();
    const key = HexConverter.encode(f.members[0][1]);
    // member "a": [ "a", key, 1 ] -> [ "a", key, "1" ]
    expectEncoding(replaceBytes(genesis(), key + '01', key + '6131'));
  });

  it('rejects text that is not UTF-8', () => {
    const f = GENESIS();
    const hex = HexConverter.encode(buildEntry(f)).replace('8361615821', '83' + '61ff' + '5821');
    expectEncoding(HexConverter.decode(hex));
  });
});
