import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IReleasePin } from '../../../../../src/api/bft/trustbase/ReleasePin.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { ITrustBaseBundleLimits } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import {
  HistoryConflictedError,
  ReleasePinInvalidError,
  TrustBaseBeforeGenesisError,
  TrustBaseChainError,
  TrustBaseConflictError,
  TrustBaseEncodingError,
  TrustBaseGapError,
  TrustBaseInvalidError,
  TrustBaseNetworkError,
  TrustBasePinMismatchError,
  TrustBaseSignatureError,
  TrustBaseStoreError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseSession } from '../../../../../src/api/bft/trustbase/TrustBaseSession.js';
import {
  MemoryTrustBaseStore,
  trustBaseCacheKey,
  trustBaseRevision,
} from '../../../../../src/api/bft/trustbase/TrustBaseStore.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

/**
 * The shared UTB cache vectors, vendored byte for byte from ristik/state-transition-sdk-rust, commit ecd4712 (PR #17),
 * tests/vectors/utb-cache/v1/vectors.json (see tests/vectors/utb-cache/README.md).
 */
interface ILimits {
  maxBundleBytes: number | null;
  maxEntries: number | null;
  maxEntryBytes?: number | null;
}

interface IVectors {
  readonly bundles: { readonly hex: string; readonly name: string }[];
  readonly entries: { readonly hex: string; readonly name: string }[];
  readonly flush: {
    cache: { bundle: string } | null;
    expect: { diagnostics: string[]; result: string; stored: string; tipEpoch?: string };
    limits: ILimits;
    name: string;
    offers: string[];
    pin: string;
    store: 'ignoresBudget' | null;
    storeAfterOpen?: { bundle: string };
  }[];
  readonly key: { genesisEntryId: string; key: string; namespace: string; network: number }[];
  readonly limits: { casAttempts: number; maxBundleBytes: number; maxEntries: number; maxEntryBytes: number };
  readonly offer: {
    cache: { bundle: string } | null;
    expect: { conflicted: boolean; results: string[]; tipEpoch: string };
    name: string;
    offers: string[];
    pin: string;
  }[];
  readonly open: {
    cache: { bundle: string } | null;
    expect: {
      diagnostics: string[];
      exportBundle?: string;
      flushNeeded: boolean;
      tipEntryId: string;
      tipEpoch: string;
    };
    limits?: ILimits;
    name: string;
    pin: string;
    store: 'ignoresBudget' | 'oversize' | 'unreadable' | null;
  }[];
  readonly pins: {
    bundle: string;
    bundleSha256: string;
    error?: string;
    genesisEntryId: string;
    genesisEpoch: string;
    name: string;
    network: number;
    pinnedEntryId: string;
    pinnedEpoch: string;
    valid: boolean;
  }[];
  readonly revision: { hex: string; revision: string }[];
}

const vectors = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/vectors/utb-cache/vectors.json'), 'utf8'),
) as IVectors;
const NAMESPACE = 'test';

function pinOf(name: string): IReleasePin {
  const row = vectors.pins.find((candidate) => candidate.name === name);
  if (row === undefined) {
    throw new Error(`No pin ${name}`);
  }
  return {
    bundleSha256: HexConverter.decode(row.bundleSha256),
    embeddedBundle: HexConverter.decode(row.bundle),
    genesisEntryId: HexConverter.decode(row.genesisEntryId),
    genesisEpoch: BigInt(row.genesisEpoch),
    networkId: NetworkId.fromId(row.network),
    pinnedEntryId: HexConverter.decode(row.pinnedEntryId),
    pinnedEpoch: BigInt(row.pinnedEpoch),
  };
}

function bundleBytes(name: string): Uint8Array {
  const row = vectors.bundles.find((candidate) => candidate.name === name);
  if (row === undefined) {
    throw new Error(`No bundle ${name}`);
  }
  return HexConverter.decode(row.hex);
}

function entryOf(name: string): RootTrustBaseV2 {
  const row = vectors.entries.find((candidate) => candidate.name === name);
  if (row === undefined) {
    throw new Error(`No entry ${name}`);
  }
  return RootTrustBaseV2.decode(HexConverter.decode(row.hex));
}

/** A store that fails on demand, counts writes, or serves bytes without enforcing the byte budget. */
class VectorStore extends MemoryTrustBaseStore {
  public failure: TrustBaseStoreError | null = null;
  public ignoresBudget = false;
  public swaps = 0;

  public override compareAndSwap(
    key: string,
    expected: string | null,
    bytes: Uint8Array,
  ): ReturnType<MemoryTrustBaseStore['compareAndSwap']> {
    this.swaps++;
    return super.compareAndSwap(key, expected, bytes);
  }

  public override read(key: string, maxBytes: number): ReturnType<MemoryTrustBaseStore['read']> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return super.read(key, this.ignoresBudget ? Number.MAX_SAFE_INTEGER : maxBytes);
  }
}

function limitsOf(limits: ILimits | undefined): ITrustBaseBundleLimits {
  return {
    maxBytes: limits?.maxBundleBytes ?? vectors.limits.maxBundleBytes,
    maxEntries: limits?.maxEntries ?? vectors.limits.maxEntries,
    maxEntryBytes: limits?.maxEntryBytes ?? vectors.limits.maxEntryBytes,
  };
}

async function seeded(pin: IReleasePin, cache: { bundle: string } | null): Promise<VectorStore> {
  const store = new VectorStore();
  if (cache !== null) {
    await store.compareAndSwap(
      trustBaseCacheKey(pin.networkId, pin.genesisEntryId, NAMESPACE),
      null,
      bundleBytes(cache.bundle),
    );
    store.swaps = 0;
  }
  return store;
}

function diagnosticLabel(d: { code: string; reason?: string }): string {
  return d.reason === undefined ? d.code : `${d.code}:${d.reason}`;
}

function pendingLabel(error: unknown): string {
  if (error instanceof TrustBasePinMismatchError) {
    return 'PinMismatch';
  }
  if (error instanceof HistoryConflictedError) {
    return 'HistoryConflicted';
  }
  if (error instanceof TrustBaseStoreError && error.reason === 'oversize') {
    return 'Oversize';
  }
  return `unexpected:${String(error)}`;
}

function refusalLabel(error: unknown): string {
  if (error instanceof TrustBasePinMismatchError) {
    return 'PinMismatch';
  }
  if (error instanceof TrustBaseConflictError && error.authenticated) {
    return 'Conflict';
  }
  if (error instanceof HistoryConflictedError) {
    return 'HistoryConflicted';
  }
  const classes: [new (...args: never[]) => Error, string][] = [
    [TrustBaseNetworkError, 'network'],
    [TrustBaseBeforeGenesisError, 'beforeGenesis'],
    [TrustBaseGapError, 'gap'],
    [TrustBaseChainError, 'chain'],
    [TrustBaseSignatureError, 'signature'],
    [TrustBaseInvalidError, 'invalid'],
    [TrustBaseEncodingError, 'encoding'],
  ];
  for (const [type, label] of classes) {
    if (error instanceof type) {
      return `refused:${label}`;
    }
  }
  return `unexpected:${String(error)}`;
}

describe('UTB cache: shared vectors', () => {
  it('pins the vendored file', () => {
    expect(vectors.limits).toEqual({
      casAttempts: 4,
      maxBundleBytes: 16 * 1024 * 1024,
      maxEntries: 4096,
      maxEntryBytes: 131072,
    });
  });

  it.each(vectors.pins)('pin: $name', async (row) => {
    const opened = TrustBaseSession.openPrivate(NAMESPACE, pinOf(row.name), new MemoryTrustBaseStore());
    if (row.valid) {
      const { session } = await opened;
      expect(session.history.tip?.epoch).toBe(BigInt(row.pinnedEpoch));
    } else {
      expect(row.error).toBe('ReleasePinInvalid');
      await expect(opened).rejects.toBeInstanceOf(ReleasePinInvalidError);
    }
  });

  it.each(vectors.open)('open: $name', async (row) => {
    const pin = pinOf(row.pin);
    const store = await seeded(pin, row.cache);
    store.ignoresBudget = row.store === 'ignoresBudget';
    if (row.store === 'unreadable') {
      store.failure = new TrustBaseStoreError('io', 'unreadable');
    }
    if (row.store === 'oversize') {
      store.failure = new TrustBaseStoreError('oversize', 'oversize');
    }
    const { diagnostics, session } = await TrustBaseSession.openPrivate(NAMESPACE, pin, store, {
      limits: limitsOf(row.limits),
    });
    expect(diagnostics.map(diagnosticLabel)).toEqual(row.expect.diagnostics);
    expect(session.history.tip?.epoch).toBe(BigInt(row.expect.tipEpoch));
    expect(HexConverter.encode(await session.history.tip!.entryId())).toBe(row.expect.tipEntryId);
    expect(session.dirty).toBe(row.expect.flushNeeded);
    if (row.expect.exportBundle !== undefined) {
      expect(await session.exportBundle()).toEqual(bundleBytes(row.expect.exportBundle));
    }
  });

  it.each(vectors.offer)('offer: $name', async (row) => {
    const pin = pinOf(row.pin);
    const { session } = await TrustBaseSession.openPrivate(NAMESPACE, pin, await seeded(pin, row.cache));
    const results: string[] = [];
    for (const name of row.offers) {
      if (name === '@verify') {
        try {
          void session.history.tip;
          results.push('ok');
        } catch (error) {
          results.push(refusalLabel(error));
        }
        continue;
      }
      try {
        results.push(await session.append(entryOf(name)));
      } catch (error) {
        results.push(refusalLabel(error));
      }
    }
    expect(results).toEqual(row.expect.results);
    expect(session.conflict !== null).toBe(row.expect.conflicted);
    expect(session.tip?.epoch).toBe(BigInt(row.expect.tipEpoch));
  });

  it('writes at most casAttempts times per flush', () => {
    expect(vectors.limits.casAttempts).toBe(4);
  });

  it.each(vectors.flush)('flush: $name', async (row) => {
    const pin = pinOf(row.pin);
    const store = await seeded(pin, row.cache);
    store.ignoresBudget = row.store === 'ignoresBudget';
    const key = trustBaseCacheKey(pin.networkId, pin.genesisEntryId, NAMESPACE);
    const { session } = await TrustBaseSession.openPrivate(NAMESPACE, pin, store, { limits: limitsOf(row.limits) });
    if (row.storeAfterOpen !== undefined) {
      store.failure = null;
      const revision = (await store.read(key, Number.MAX_SAFE_INTEGER))?.revision ?? null;
      await store.compareAndSwap(key, revision, bundleBytes(row.storeAfterOpen.bundle));
      store.swaps = 0;
    }
    const before2 = (await store.read(key, Number.MAX_SAFE_INTEGER))?.bytes ?? null;
    for (const name of row.offers) {
      await session.append(entryOf(name)).catch(() => undefined);
    }
    const result = await session.flush();
    const reported = result.status === 'saved' ? result.diagnostics.map(diagnosticLabel) : [];
    expect(reported).toEqual(row.expect.diagnostics);
    if (row.expect.tipEpoch !== undefined) {
      expect(session.tip?.epoch).toBe(BigInt(row.expect.tipEpoch));
    }
    const label =
      result.status === 'saved'
        ? store.swaps > 0
          ? 'saved:wrote'
          : 'saved:noop'
        : `pending:${pendingLabel(result.error)}`;
    expect(label).toBe(row.expect.result);
    const after = (await store.read(key, Number.MAX_SAFE_INTEGER))?.bytes ?? null;
    const expected =
      row.expect.stored === 'unchanged'
        ? before2
        : row.expect.stored === 'absent'
          ? null
          : bundleBytes(row.expect.stored);
    expect(after).toEqual(expected);
  });

  it.each(vectors.key)('key: $key', (row) => {
    expect(
      trustBaseCacheKey(NetworkId.fromId(row.network), HexConverter.decode(row.genesisEntryId), row.namespace),
    ).toBe(row.key);
  });

  it.each(vectors.revision)('revision of $hex', (row) => {
    expect(trustBaseRevision(HexConverter.decode(row.hex))).toBe(row.revision);
  });
});
