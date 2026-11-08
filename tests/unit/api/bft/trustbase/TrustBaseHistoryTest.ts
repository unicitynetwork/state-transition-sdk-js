import {
  buildBundle,
  buildEntry,
  IEntryFields,
  loadVectors,
  parseBundleFields,
  parseEntryFields,
  signEntry,
  signRecoverable,
  testSecret,
  toHighS,
  vectorEntry,
} from './TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import {
  TrustBaseChainError,
  TrustBaseConflictError,
  TrustBaseGapError,
  TrustBaseInvalidError,
  TrustBaseSignatureError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseHistory } from '../../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { SigningService } from '../../../../../src/crypto/secp256k1/SigningService.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

interface IHistoryVector {
  readonly finalEntryIds: string[] | null;
  readonly name: string;
  readonly steps: { readonly entry: string; readonly outcome: string }[];
}

interface IQuorumVector {
  readonly committee: string;
  readonly entry: string;
  readonly name: string;
  readonly signedWeight: number;
  readonly signers: string[];
  readonly threshold: number;
  readonly valid: boolean;
}

const vectors = loadVectors() as ReturnType<typeof loadVectors> & {
  history: IHistoryVector[];
  weightedQuorum: IQuorumVector[];
};
const decode = (name: string): RootTrustBaseV2 => RootTrustBaseV2.decode(vectorEntry(name));
const idOf = (entry: RootTrustBaseV2): Promise<Uint8Array> => entry.entryId();
const hex = (bytes: Uint8Array): string => HexConverter.encode(bytes);
const GENESIS = (): IEntryFields => parseEntryFields(vectorEntry('genesis'));
const EPOCH2 = (): IEntryFields => parseEntryFields(vectorEntry('epoch2-signed-abc'));

async function pinned(): Promise<TrustBaseHistory> {
  const history = TrustBaseHistory.create(await idOf(decode('genesis')));
  await history.append(decode('genesis'));
  return history;
}

const OUTCOME_ERRORS: Record<string, new (...args: never[]) => Error> = {
  conflict: TrustBaseConflictError,
  'error:chain': TrustBaseChainError,
  'error:invalid': TrustBaseInvalidError,
  'error:signature': TrustBaseSignatureError,
  gap: TrustBaseGapError,
};

describe('TrustBaseHistory: shared vectors', () => {
  it.each(vectors.history)('history: $name', async (vector) => {
    const first = RootTrustBaseV2.decode(HexConverter.decode(vector.steps[0].entry));
    // The reference pins nothing; the first entry of every vector is the genesis, so its id is the pin.
    const history = TrustBaseHistory.create(await idOf(first));
    for (const step of vector.steps) {
      const entry = RootTrustBaseV2.decode(HexConverter.decode(step.entry));
      if (step.outcome === 'appended' || step.outcome === 'noop') {
        await expect(history.append(entry)).resolves.toBe(step.outcome);
      } else {
        await expect(history.append(entry)).rejects.toBeInstanceOf(OUTCOME_ERRORS[step.outcome]);
      }
    }
    const held = await Promise.all(history.entries.map(async (entry) => hex(await idOf(entry))));
    expect(held).toEqual(vector.finalEntryIds ?? []);
  });

  it.each(vectors.weightedQuorum)('weighted quorum: $name', async (vector) => {
    const committee = decode(vector.committee);
    const entry = RootTrustBaseV2.decode(HexConverter.decode(vector.entry));
    const signatures = entry.signatures ?? new Map<string, Uint8Array>();
    expect(Array.from(signatures.keys())).toEqual(vector.signers);

    const weights = await Promise.all(
      Array.from(signatures, ([nodeId, signature]) => committee.verifySignature(entry.sigBytes(), signature, nodeId)),
    );
    expect(weights.reduce((total, weight) => total + weight, 0n)).toBe(BigInt(vector.signedWeight));
    expect(committee.quorumThreshold).toBe(BigInt(vector.threshold));

    const verdict = committee.verifyQuorumSignatures(entry.sigBytes(), signatures);
    if (vector.valid) {
      await expect(verdict).resolves.toBeUndefined();
    } else {
      await expect(verdict).rejects.toBeInstanceOf(TrustBaseSignatureError);
    }
  });
});

describe('RootTrustBaseV2 signatures, one rule at a time', () => {
  const genesis = (): RootTrustBaseV2 => decode('genesis');
  const data = new Uint8Array([1, 2, 3]);
  const good = (): Uint8Array => signRecoverable(data, testSecret('a'));

  it('control: a valid signature over the data returns the signer weight', async () => {
    await expect(genesis().verifySignature(data, good(), 'a')).resolves.toBe(1n);
  });

  it('rejects a signer that is not a member', async () => {
    await expect(genesis().verifySignature(data, good(), 'z')).rejects.toThrow(/not a member/);
  });

  it('rejects the 64-byte compact form and any other length', async () => {
    await expect(genesis().verifySignature(data, good().slice(0, 64), 'a')).rejects.toBeInstanceOf(
      TrustBaseSignatureError,
    );
    await expect(genesis().verifySignature(data, new Uint8Array([...good(), 0]), 'a')).rejects.toBeInstanceOf(
      TrustBaseSignatureError,
    );
    await expect(genesis().verifySignature(data, new Uint8Array(0), 'a')).rejects.toBeInstanceOf(
      TrustBaseSignatureError,
    );
  });

  it('rejects a recovery id above 3', async () => {
    const signature = good();
    signature[64] = 4;
    await expect(genesis().verifySignature(data, signature, 'a')).rejects.toThrow(/recovery id/);
  });

  it('rejects a high-S signature that still recovers the signer', async () => {
    const high = toHighS(good());
    await expect(genesis().verifySignature(data, high, 'a')).rejects.toThrow(/not valid/);
  });

  it('rejects a signature of another member, another message and a flipped recovery id', async () => {
    await expect(genesis().verifySignature(data, good(), 'b')).rejects.toBeInstanceOf(TrustBaseSignatureError);
    await expect(genesis().verifySignature(new Uint8Array([9]), good(), 'a')).rejects.toBeInstanceOf(
      TrustBaseSignatureError,
    );
    const flipped = good();
    flipped[64] ^= 1;
    await expect(genesis().verifySignature(data, flipped, 'a')).rejects.toBeInstanceOf(TrustBaseSignatureError);
  });

  it('counts every signer once and reaches the threshold exactly', async () => {
    const sign = (names: string[]): Map<string, Uint8Array> =>
      new Map(names.map((n): [string, Uint8Array] => [n, signRecoverable(data, testSecret(n))]));
    await expect(genesis().verifyQuorumSignatures(data, sign(['a', 'b', 'c']))).resolves.toBeUndefined();
    await expect(genesis().verifyQuorumSignatures(data, sign(['a', 'b']))).rejects.toThrow(
      /Quorum not reached, signed weight 2, threshold 3/,
    );
    await expect(genesis().verifyQuorumSignatures(data, new Map())).rejects.toBeInstanceOf(TrustBaseSignatureError);
  });

  it('an unknown or invalid extra fails the whole check even when the rest reach the quorum', async () => {
    const sign = (names: string[]): Map<string, Uint8Array> =>
      new Map(names.map((n): [string, Uint8Array] => [n, signRecoverable(data, testSecret(n))]));
    const withUnknown = sign(['a', 'b', 'c', 'd']);
    withUnknown.set('z', good());
    await expect(genesis().verifyQuorumSignatures(data, withUnknown)).rejects.toThrow(/not a member/);
    const withBad = sign(['a', 'b', 'c']);
    withBad.set('d', signRecoverable(data, testSecret('a')));
    await expect(genesis().verifyQuorumSignatures(data, withBad)).rejects.toThrow(/not valid/);
    const withHigh = sign(['a', 'b', 'c']);
    withHigh.set('d', toHighS(signRecoverable(data, testSecret('d'))));
    await expect(genesis().verifyQuorumSignatures(data, withHigh)).rejects.toThrow(/not valid/);
  });
});

describe('RootTrustBaseV2.verifySuccessor and verifyGenesis, one rule at a time', () => {
  const successor = async (
    changes: Partial<IEntryFields> = {},
    signers = ['a', 'b', 'c'],
  ): Promise<RootTrustBaseV2> => {
    const previousId = await idOf(decode('genesis'));
    return RootTrustBaseV2.decode(signEntry({ ...EPOCH2(), previousEntryId: previousId, ...changes }, signers));
  };

  it('control: a successor signed by a quorum of the predecessor is accepted', async () => {
    await expect((await successor()).verifySuccessor(decode('genesis'))).resolves.toBeUndefined();
    // and the helper reproduces the vector entry byte for byte
    expect(hex((await successor()).encode())).toEqual(hex(vectorEntry('epoch2-signed-abc')));
  });

  it('rejects a genesis entry as a successor', async () => {
    await expect(decode('genesis').verifySuccessor(decode('genesis'))).rejects.toThrow(
      /genesis entry has no predecessor/,
    );
  });

  it('rejects another network', async () => {
    await expect((await successor({ network: 6n })).verifySuccessor(decode('genesis'))).rejects.toThrow(
      /Network 6, predecessor 5/,
    );
  });

  it('rejects an epoch that is not the predecessor epoch plus one', async () => {
    await expect((await successor({ epoch: 3n })).verifySuccessor(decode('genesis'))).rejects.toThrow(
      /Epoch 3, predecessor 1/,
    );
    await expect((await successor({ epoch: 1n })).verifySuccessor(decode('genesis'))).rejects.toThrow(
      /Epoch 1, predecessor 1/,
    );
  });

  it('rejects a start round that does not advance', async () => {
    const start = GENESIS().epochStart;
    await expect((await successor({ epochStart: start })).verifySuccessor(decode('genesis'))).rejects.toThrow(
      /Epoch start/,
    );
    await expect((await successor({ epochStart: start - 1n })).verifySuccessor(decode('genesis'))).rejects.toThrow(
      /Epoch start/,
    );
    await expect(
      (await successor({ epochStart: start + 1n })).verifySuccessor(decode('genesis')),
    ).resolves.toBeUndefined();
  });

  it('rejects a predecessor id that is not the predecessor entry id', async () => {
    const wrong = new Uint8Array(32).fill(0x33);
    await expect((await successor({ previousEntryId: wrong })).verifySuccessor(decode('genesis'))).rejects.toThrow(
      /does not match/,
    );
  });

  it('rejects an entry signed by too few of the predecessor, as a signature error and not a chain error', async () => {
    const two = await successor({}, ['a', 'b']);
    await expect(two.verifySuccessor(decode('genesis'))).rejects.toBeInstanceOf(TrustBaseSignatureError);
  });

  it('is signed by the members of the predecessor, not by its own (a rotation)', async () => {
    const rotated = Object.fromEntries(
      ['d', 'e', 'f'].map((name) => [name, new SigningService(testSecret(name)).publicKey]),
    );
    const members = Object.entries(rotated).map(([name, key]): [string, Uint8Array, bigint] => [name, key, 1n]);
    const previousEntryId = await idOf(decode('genesis'));
    const make = (signers: string[]): RootTrustBaseV2 =>
      RootTrustBaseV2.decode(signEntry({ ...EPOCH2(), members, previousEntryId, quorum: 3n }, signers));

    await expect(make(['a', 'b', 'c']).verifySuccessor(decode('genesis'))).resolves.toBeUndefined();
    await expect(make(['d', 'e', 'f']).verifySuccessor(decode('genesis'))).rejects.toBeInstanceOf(
      TrustBaseSignatureError,
    );
  });

  it('verifyGenesis: accepts a genesis and refuses a successor', () => {
    expect(() => decode('genesis').verifyGenesis()).not.toThrow();
    expect(() => decode('epoch2-signed-abc').verifyGenesis()).toThrow(/Not a genesis entry/);
  });
});

describe('TrustBaseHistory: rules, one at a time', () => {
  const bundle = (): Promise<TrustBaseBundle> => {
    const vector = vectors.bundles.find((candidate) => candidate.name.startsWith('three'));
    return TrustBaseBundle.decode(HexConverter.decode(vector?.hex ?? ''), { maxBytes: 1 << 20, maxEntries: 64 });
  };

  it('starts empty and accepts the pinned genesis only', async () => {
    const history = TrustBaseHistory.create(await idOf(decode('genesis')));
    expect(history.isEmpty).toBe(true);
    expect(history.tip).toBeNull();
    await expect(history.append(decode('genesis'))).resolves.toBe('appended');
    expect(history.isEmpty).toBe(false);
    expect(history.tip?.epoch).toBe(1n);
  });

  it('keeps its own copy of the pin', async () => {
    const pin = await idOf(decode('genesis'));
    const history = TrustBaseHistory.create(pin);
    pin.fill(0);
    await expect(history.append(decode('genesis'))).resolves.toBe('appended');
  });

  it('refuses a genesis that is not the pinned identity, and a pin that is not 32 bytes', async () => {
    const history = TrustBaseHistory.create(new Uint8Array(32).fill(1));
    await expect(history.append(decode('genesis'))).rejects.toThrow(/not the pinned identity/);
    expect(history.isEmpty).toBe(true);
    expect(() => TrustBaseHistory.create(new Uint8Array(31))).toThrow(TrustBaseInvalidError);
  });

  it('refuses a first entry that is not a genesis, whatever the pin', async () => {
    const next = decode('epoch2-signed-abc');
    const history = TrustBaseHistory.create(await idOf(next));
    await expect(history.append(next)).rejects.toBeInstanceOf(TrustBaseInvalidError);
  });

  it('appends consecutive entries; a re-sent held entry and another valid signature subset are no-ops', async () => {
    const history = await pinned();
    await expect(history.append(decode('epoch2-signed-abc'))).resolves.toBe('appended');
    await expect(history.append(decode('epoch2-signed-abc'))).resolves.toBe('noop');
    await expect(history.append(decode('epoch2-signed-abd'))).resolves.toBe('noop');
    await expect(history.append(decode('genesis'))).resolves.toBe('noop');
    expect(history.entries).toHaveLength(2);
  });

  it('a held epoch with a bad witness is an error, not a no-op', async () => {
    const history = await pinned();
    await history.append(decode('epoch2-signed-abc'));
    const witness = RootTrustBaseV2.decode(
      signEntry({ ...EPOCH2(), previousEntryId: await idOf(decode('genesis')) }, ['a', 'b']),
    );
    await expect(history.append(witness)).rejects.toBeInstanceOf(TrustBaseSignatureError);
    expect(history.entries).toHaveLength(2);
  });

  it('a different entry for a held epoch is a conflict that names the epoch', async () => {
    const history = await pinned();
    await history.append(decode('epoch2-signed-abc'));
    const other = RootTrustBaseV2.decode(
      signEntry({ ...EPOCH2(), epochStart: EPOCH2().epochStart + 1n, previousEntryId: await idOf(decode('genesis')) }, [
        'a',
        'b',
        'c',
      ]),
    );
    const failure = await history.append(other).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TrustBaseConflictError);
    expect((failure as TrustBaseConflictError).epoch).toBe(2n);
  });

  it('an entry more than one epoch ahead is a gap that carries both epochs', async () => {
    const history = await pinned();
    const failure = await history.append(decode('epoch3-signed-abc')).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TrustBaseGapError);
    expect([(failure as TrustBaseGapError).epoch, (failure as TrustBaseGapError).tipEpoch]).toEqual([3n, 1n]);
  });

  it('refuses an entry below the genesis epoch', async () => {
    const base = GENESIS();
    const genesis = RootTrustBaseV2.decode(buildEntry({ ...base, epoch: 5n }));
    const history = TrustBaseHistory.create(await idOf(genesis));
    await history.append(genesis);
    const below = RootTrustBaseV2.decode(signEntry({ ...EPOCH2(), epoch: 4n }, ['a', 'b', 'c']));
    await expect(history.append(below)).rejects.toThrow(/before the genesis epoch 5/);
  });

  it('a failed append leaves the history unchanged and does not block the next one', async () => {
    const history = await pinned();
    await expect(history.append(decode('epoch3-signed-abc'))).rejects.toBeInstanceOf(TrustBaseGapError);
    await expect(history.append(decode('epoch2-signed-abc'))).resolves.toBe('appended');
    expect(history.entries.map((entry) => entry.epoch)).toEqual([1n, 2n]);
  });

  it('serialises concurrent appends', async () => {
    const history = await pinned();
    const results = await Promise.allSettled([
      history.append(decode('epoch2-signed-abc')),
      history.append(decode('epoch2-signed-abc')),
    ]);
    expect(results.map((result) => (result.status === 'fulfilled' ? result.value : 'rejected'))).toEqual([
      'appended',
      'noop',
    ]);
    const ordered = await Promise.allSettled([
      history.append(decode('epoch3-signed-abc')),
      history.append(decode('epoch3-signed-abc')),
    ]);
    expect(ordered.map((result) => (result.status === 'fulfilled' ? result.value : 'rejected'))).toEqual([
      'appended',
      'noop',
    ]);
    expect(history.entries.map((entry) => entry.epoch)).toEqual([1n, 2n, 3n]);
  });

  it('hands out copies of its entries and pin', async () => {
    const history = await pinned();
    history.entries.pop();
    history.genesisPin.fill(0);
    expect(history.entries).toHaveLength(1);
    expect(hex(history.genesisPin)).toEqual(hex(await idOf(decode('genesis'))));
  });

  it('loads a bundle through append', async () => {
    const loaded = await bundle();
    const history = await TrustBaseHistory.fromBundle(loaded, await idOf(loaded.entries[0]));
    expect(history.entries.map((entry) => entry.epoch)).toEqual([1n, 2n, 3n]);
  });

  it('a bundle with another genesis than the pin is refused', async () => {
    const loaded = await bundle();
    await expect(TrustBaseHistory.fromBundle(loaded, new Uint8Array(32).fill(9))).rejects.toThrow(
      /not the pinned identity/,
    );
  });

  it('a bundle whose entry is not signed by a quorum is refused, though it decodes', async () => {
    const vector = vectors.history.find((candidate) => candidate.name === 'a wrong signature');
    const bad = HexConverter.decode(vector?.steps[1].entry ?? '');
    const fields = parseBundleFields(HexConverter.decode(vectors.bundles[1].hex));
    const badEntry = RootTrustBaseV2.decode(bad);
    const crafted = buildBundle({
      ...fields,
      effectiveEnd: 2n,
      endEntryId: await idOf(badEntry),
      entries: [fields.entries[0], bad],
    });
    const decoded = await TrustBaseBundle.decode(crafted, { maxBytes: 1 << 20, maxEntries: 64 });
    await expect(TrustBaseHistory.fromBundle(decoded, await idOf(decoded.entries[0]))).rejects.toBeInstanceOf(
      TrustBaseSignatureError,
    );
  });
});
