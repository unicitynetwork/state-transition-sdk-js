import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileTrustBaseStore } from '../../../../../../src/api/bft/trustbase/node/FileTrustBaseStore.js';
import { RootTrustBaseV2 } from '../../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import { CacheBusyError, TrustBaseStoreError } from '../../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseSession } from '../../../../../../src/api/bft/trustbase/TrustBaseSession.js';
import { trustBaseRevision } from '../../../../../../src/api/bft/trustbase/TrustBaseStore.js';
import { buildChain, buildPin } from '../TrustBaseTestUtils.js';

const KEY = 'utb/v1/7/abcd/test';
const A = new Uint8Array([1, 2, 3]);
const B = new Uint8Array([4, 5, 6, 7]);

describe('FileTrustBaseStore', () => {
  let directory: string;
  let store: FileTrustBaseStore;
  const stem = (): string => FileTrustBaseStore.stem(KEY);
  const file = (): string => join(directory, `${stem()}.cbor`);

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'utb-file-store-'));
    store = new FileTrustBaseStore(directory);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    chmodSync(directory, 0o755);
    rmSync(directory, { force: true, recursive: true });
  });

  it('names files and locks as the Rust store does', () => {
    // sha256("utb/v1/7/abcd/test"), the shared file name.
    expect(stem()).toMatch(/^utb-[0-9a-f]{64}$/);
    expect(FileTrustBaseStore.stem('')).toBe('utb-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('reads absent as null, writes from absent, refuses a stale revision', async () => {
    await expect(store.read(KEY, 100)).resolves.toBeNull();
    await expect(store.compareAndSwap(KEY, trustBaseRevision(A), A)).resolves.toBe('changed');
    expect(existsSync(file())).toBe(false);
    await expect(store.compareAndSwap(KEY, null, A)).resolves.toBe('written');
    await expect(store.compareAndSwap(KEY, null, B)).resolves.toBe('changed');
    const read = await store.read(KEY, 100);
    expect(read).toEqual({ bytes: A, revision: trustBaseRevision(A) });
    await expect(store.compareAndSwap(KEY, read?.revision ?? '', B)).resolves.toBe('written');
    expect(new Uint8Array(readFileSync(file()))).toEqual(B);
  });

  it('creates the directory, parents included, on the first write, and reads an absent one as null', async () => {
    const nested = join(directory, 'a', 'b');
    const fresh = new FileTrustBaseStore(nested);
    await expect(fresh.read(KEY, 100)).resolves.toBeNull();
    await expect(fresh.compareAndSwap(KEY, null, A)).resolves.toBe('written');
    expect(new Uint8Array(readFileSync(join(nested, `${stem()}.cbor`)))).toEqual(A);
    expect(readdirSync(nested)).toEqual([`${stem()}.cbor`]);
  });

  it('reports a store path that is a file as an I/O error, not as a busy lock', async () => {
    const path = join(directory, 'a-file');
    writeFileSync(path, A);
    const error: unknown = await new FileTrustBaseStore(path).compareAndSwap(KEY, null, A).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrustBaseStoreError);
    expect(error).not.toBeInstanceOf(CacheBusyError);
  });

  it('leaves no lock and no temporary file behind', async () => {
    await store.compareAndSwap(KEY, null, A);
    await store.compareAndSwap(KEY, trustBaseRevision(A), B);
    await store.compareAndSwap(KEY, 'stale', B);
    expect(readdirSync(directory)).toEqual([`${stem()}.cbor`]);
  });

  it('judges the size before reading, and refuses a file over the budget as oversize', async () => {
    writeFileSync(file(), new Uint8Array(1000));
    const error: unknown = await store.read(KEY, 999).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrustBaseStoreError);
    expect((error as TrustBaseStoreError).reason).toBe('oversize');
    await expect(store.read(KEY, 1000)).resolves.not.toBeNull();
    // The swap rereads under the lock with its own budget.
    const small = new FileTrustBaseStore(directory, 10);
    const swap: unknown = await small.compareAndSwap(KEY, null, A).catch((e: unknown) => e);
    expect((swap as TrustBaseStoreError).reason).toBe('oversize');
    expect(existsSync(join(directory, `${stem()}.lock`))).toBe(false);
  });

  it('removes temporary files a crashed writer left, under the lock', async () => {
    writeFileSync(join(directory, `${stem()}.tmp-99999-0`), A);
    writeFileSync(join(directory, 'unrelated.tmp-1-1'), A);
    await store.compareAndSwap(KEY, null, A);
    expect(readdirSync(directory).sort()).toEqual([`${stem()}.cbor`, 'unrelated.tmp-1-1'].sort());
  });

  it('refuses a file that grew between the size check and the read', async () => {
    writeFileSync(file(), A);
    const real = fsPromises.open.bind(fsPromises);
    jest.spyOn(fsPromises, 'open').mockImplementation(async (...args: Parameters<typeof real>) => {
      const handle = await real(...args);
      jest.spyOn(handle, 'stat').mockResolvedValue({ size: 1 } as Awaited<ReturnType<typeof handle.stat>>);
      return handle;
    });
    const error: unknown = await store.read(KEY, 100).catch((e: unknown) => e);
    expect((error as TrustBaseStoreError).reason).toBe('oversize');
  });

  it('is busy at once when the lock exists, never waits, never steals, and writes nothing', async () => {
    mkdirSync(join(directory, `${stem()}.lock`));
    await expect(store.compareAndSwap(KEY, null, A)).rejects.toBeInstanceOf(CacheBusyError);
    // An orphan lock stays: it is for the application to clear.
    await expect(store.compareAndSwap(KEY, null, A)).rejects.toBeInstanceOf(CacheBusyError);
    expect(existsSync(join(directory, `${stem()}.lock`))).toBe(true);
    expect(existsSync(file())).toBe(false);
    // Readers need no lock.
    await expect(store.read(KEY, 100)).resolves.toBeNull();
  });

  it('lets exactly one of two concurrent writers from one revision win; the other is busy or changed', async () => {
    const other = new FileTrustBaseStore(directory);
    const results = await Promise.allSettled([store.compareAndSwap(KEY, null, A), other.compareAndSwap(KEY, null, B)]);
    const written = results.filter((r) => r.status === 'fulfilled' && r.value === 'written');
    expect(written).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(CacheBusyError);
      }
    }
    const read = await store.read(KEY, 100);
    expect([A, B]).toContainEqual(read?.bytes);
  });

  it('keeps the old bytes when the write is interrupted before the rename, and releases the lock', async () => {
    await store.compareAndSwap(KEY, null, A);
    jest.spyOn(fsPromises, 'rename').mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'EIO' }));
    const error: unknown = await store.compareAndSwap(KEY, trustBaseRevision(A), B).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrustBaseStoreError);
    expect((error as TrustBaseStoreError).reason).toBe('io');
    expect(new Uint8Array(readFileSync(file()))).toEqual(A);
    expect(readdirSync(directory)).toEqual([`${stem()}.cbor`]);
  });

  it('reports a full disk as quota and a denied directory as permission', async () => {
    jest.spyOn(fsPromises, 'rename').mockRejectedValueOnce(Object.assign(new Error('full'), { code: 'ENOSPC' }));
    const full: unknown = await store.compareAndSwap(KEY, null, A).catch((e: unknown) => e);
    expect((full as TrustBaseStoreError).reason).toBe('quota');
    jest.restoreAllMocks();

    if (process.getuid?.() !== 0) {
      chmodSync(directory, 0o500);
      const denied: unknown = await store.compareAndSwap(KEY, null, A).catch((e: unknown) => e);
      expect((denied as TrustBaseStoreError).reason).toBe('permission');
      chmodSync(directory, 0o755);
    }
  });

  it('does not fall back to an unlocked write when the lock cannot be made', async () => {
    jest.spyOn(fsPromises, 'mkdir').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(store.compareAndSwap(KEY, null, A)).rejects.toBeInstanceOf(TrustBaseStoreError);
    expect(existsSync(file())).toBe(false);
  });

  describe('with a session', () => {
    it('saves a history that a second store instance over the same directory loads strictly', async () => {
      const chain = await buildChain(6);
      const pin = await buildPin(chain, 3);
      const first = await TrustBaseSession.openPrivate('file-test', pin, store);
      await first.session.append(chain[3]);
      await first.session.append(chain[4]);
      await expect(first.session.flush()).resolves.toMatchObject({ status: 'saved', wrote: true });

      const second = await TrustBaseSession.openPrivate('file-test', pin, new FileTrustBaseStore(directory));
      expect(second.diagnostics).toEqual([]);
      expect(second.session.history.tip?.epoch).toBe(chain[4].epoch);

      // Damage it on disk: the next session falls back to the pin and repairs the file at the observed revision.
      const [name] = readdirSync(directory);
      writeFileSync(join(directory, name), new Uint8Array([9, 9, 9]));
      const third = await TrustBaseSession.openPrivate('file-test', pin, store);
      expect(third.diagnostics.map((d) => d.code)).toEqual(['CacheRejected']);
      await third.session.flush();
      const repaired = await TrustBaseBundle.decode(new Uint8Array(readFileSync(join(directory, name))), {
        maxBytes: 1 << 20,
        maxEntries: 100,
      });
      expect(repaired.entries.map((e: RootTrustBaseV2) => e.epoch)).toEqual(chain.slice(0, 3).map((e) => e.epoch));
    });

    it('reports a busy lock as a pending flush that keeps the history', async () => {
      const chain = await buildChain(5);
      const pin = await buildPin(chain, 3);
      const { session } = await TrustBaseSession.openPrivate('file-test', pin, store);
      await session.append(chain[3]);
      mkdirSync(join(directory, `${FileTrustBaseStore.stem(session.key)}.lock`));
      const result = await session.flush();
      expect(result).toMatchObject({ status: 'pending' });
      expect((result as { error: unknown }).error).toBeInstanceOf(CacheBusyError);
      expect(session.dirty).toBe(true);
      expect(session.history.tip?.epoch).toBe(chain[3].epoch);
    });
  });
});
