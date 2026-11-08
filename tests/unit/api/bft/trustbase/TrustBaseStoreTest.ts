import { TrustBaseStoreError } from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { MemoryTrustBaseStore, trustBaseRevision } from '../../../../../src/api/bft/trustbase/TrustBaseStore.js';

describe('MemoryTrustBaseStore', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('reads absent as null and swaps only from the expected revision', async () => {
    const store = new MemoryTrustBaseStore();
    await expect(store.read('k', 100)).resolves.toBeNull();
    await expect(store.compareAndSwap('k', trustBaseRevision(bytes), bytes)).resolves.toBe('changed');
    await expect(store.compareAndSwap('k', null, bytes)).resolves.toBe('written');
    await expect(store.compareAndSwap('k', null, bytes)).resolves.toBe('changed');
    const read = await store.read('k', 100);
    expect(read?.revision).toBe(trustBaseRevision(bytes));
    await expect(store.compareAndSwap('k', read?.revision ?? '', new Uint8Array([4]))).resolves.toBe('written');
    await expect(store.compareAndSwap('k', read?.revision ?? '', new Uint8Array([5]))).resolves.toBe('changed');
  });

  it('is atomic: of two swaps from one revision exactly one wins', async () => {
    const store = new MemoryTrustBaseStore();
    const results = await Promise.all([
      store.compareAndSwap('k', null, new Uint8Array([1])),
      store.compareAndSwap('k', null, new Uint8Array([2])),
    ]);
    expect(results.sort()).toEqual(['changed', 'written']);
  });

  it('keeps its own copies: neither the written nor the read bytes alias the stored value', async () => {
    const store = new MemoryTrustBaseStore();
    const written = new Uint8Array([1, 2, 3]);
    await store.compareAndSwap('k', null, written);
    written.fill(9);
    const first = await store.read('k', 100);
    first?.bytes.fill(7);
    expect((await store.read('k', 100))?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('refuses a value over the budget as oversize, before returning it', async () => {
    const store = new MemoryTrustBaseStore();
    await store.compareAndSwap('k', null, bytes);
    const error: unknown = await store.read('k', 2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrustBaseStoreError);
    expect((error as TrustBaseStoreError).reason).toBe('oversize');
    await expect(store.read('k', 3)).resolves.not.toBeNull();
  });

  it('gives the same revision to the same bytes', () => {
    expect(trustBaseRevision(bytes)).toBe(trustBaseRevision(new Uint8Array([1, 2, 3])));
    expect(trustBaseRevision(bytes)).not.toBe(trustBaseRevision(new Uint8Array([1, 2, 4])));
  });
});
