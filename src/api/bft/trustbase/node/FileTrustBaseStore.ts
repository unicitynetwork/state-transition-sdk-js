import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';

import { CacheBusyError, TrustBaseStoreError } from '../TrustBaseError.js';
import { IStoredTrustBase, ITrustBaseStore, trustBaseRevision } from '../TrustBaseStore.js';

/** Bytes a compare-and-swap rereads under the lock when no other budget is given. */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

let counter = 0;

/**
 * A directory of cache files for Node, shared by processes (and by the Rust file store: the names and the protocol are the same). Import it from
 * its own module; nothing in the core imports it, so browser builds stay clean.
 *
 * One file per key, `utb-<hex sha256(key)>.cbor`. Readers take no lock: a replacement is an atomic rename, so a read sees the old or the new
 * bytes whole. A compare-and-swap takes the lock `<stem>.lock`, a directory made with `mkdir` (it exists, or it does not: `EEXIST` is
 * {@link CacheBusyError} at once, never waited on and never stolen, and a lock a crash left behind stays until the application removes it),
 * rereads the file, compares its SHA-256 with the expected revision, writes a temporary file `<stem>.tmp-<pid>-<n>` created exclusively in the same
 * directory, syncs it, renames it over the file, syncs the directory where the platform allows, and removes the lock in `finally`. A crash before
 * the rename leaves the old bytes; after it, the complete new ones.
 */
export class FileTrustBaseStore implements ITrustBaseStore {
  public constructor(
    private readonly _directory: string,
    private readonly _casMaxBytes: number = DEFAULT_MAX_BYTES,
  ) {}

  /**
   * @param {string} key Cache key.
   * @returns {string} File stem shared with the Rust store.
   */
  public static stem(key: string): string {
    return `utb-${createHash('sha256').update(key).digest('hex')}`;
  }

  /** @inheritDoc */
  public async compareAndSwap(
    key: string,
    expectedRevision: string | null,
    bytes: Uint8Array,
  ): Promise<'changed' | 'written'> {
    const stem = FileTrustBaseStore.stem(key);
    const file = join(this._directory, `${stem}.cbor`);
    const lock = join(this._directory, `${stem}.lock`);
    try {
      // The directory may not exist yet (a first run); creating it is not part of the lock, and a path that is a file is no busy lock.
      await fs.mkdir(this._directory, { recursive: true });
    } catch (error) {
      throw classify(error);
    }
    try {
      await fs.mkdir(lock);
    } catch (error) {
      if (isCode(error, 'EEXIST')) {
        throw new CacheBusyError('Another writer holds the cache lock.');
      }
      throw classify(error);
    }
    try {
      const held = await readBounded(file, this._casMaxBytes);
      if ((held === null ? null : trustBaseRevision(held)) !== expectedRevision) {
        return 'changed';
      }
      await this.removeStaleTemporaries(stem);
      const temporary = join(this._directory, `${stem}.tmp-${process.pid}-${counter++}`);
      try {
        const handle = await fs.open(temporary, 'wx');
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temporary, file);
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw classify(error);
      }
      await this.syncDirectory();
      return 'written';
    } finally {
      await fs.rmdir(lock).catch(() => undefined);
    }
  }

  /** @inheritDoc */
  public async read(key: string, maxBytes: number): Promise<IStoredTrustBase | null> {
    const bytes = await readBounded(join(this._directory, `${FileTrustBaseStore.stem(key)}.cbor`), maxBytes);
    return bytes === null ? null : { bytes, revision: trustBaseRevision(bytes) };
  }

  /** Under the lock no other writer has a temporary file in flight, so what a crashed one left is garbage. */
  private async removeStaleTemporaries(stem: string): Promise<void> {
    try {
      for (const name of await fs.readdir(this._directory)) {
        if (name.startsWith(`${stem}.tmp-`)) {
          await fs.rm(join(this._directory, name), { force: true });
        }
      }
    } catch {
      // Cleanup is best effort; the write itself reports real failures.
    }
  }

  /** The new name is only durable once the directory is; platforms that cannot sync a directory (Windows) go without. */
  private async syncDirectory(): Promise<void> {
    let handle;
    try {
      handle = await fs.open(this._directory, 'r');
      await handle.sync();
    } catch {
      // Unsupported here; the rename itself is already atomic.
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

function classify(error: unknown): TrustBaseStoreError {
  if (error instanceof TrustBaseStoreError) {
    return error;
  }
  if (isCode(error, 'EACCES') || isCode(error, 'EPERM') || isCode(error, 'EROFS')) {
    return new TrustBaseStoreError('permission', 'Permission denied.', { cause: error });
  }
  if (isCode(error, 'ENOSPC') || isCode(error, 'EDQUOT')) {
    return new TrustBaseStoreError('quota', 'No space or quota left.', { cause: error });
  }
  return new TrustBaseStoreError('io', 'I/O failure.', { cause: error });
}

/** The whole file or null, with the size judged before anything is allocated and the read itself bounded. */
async function readBounded(file: string, maxBytes: number): Promise<Uint8Array | null> {
  let handle;
  try {
    handle = await fs.open(file, 'r');
  } catch (error) {
    if (isCode(error, 'ENOENT')) {
      return null;
    }
    throw classify(error);
  }
  try {
    const { size } = await handle.stat();
    if (size > maxBytes) {
      throw new TrustBaseStoreError('oversize', `${size} bytes exceed the budget of ${maxBytes}.`);
    }
    const buffer = new Uint8Array(size + 1);
    let bytesRead = 0;
    while (bytesRead <= size) {
      const { bytesRead: n } = await handle.read(buffer, bytesRead, size + 1 - bytesRead, bytesRead);
      if (n === 0) {
        break;
      }
      bytesRead += n;
    }
    if (bytesRead > size) {
      // Grown while it was read: the replacement is atomic, so this is not ours to interpret.
      throw new TrustBaseStoreError('oversize', 'The file changed while it was read.');
    }
    return buffer.slice(0, bytesRead);
  } catch (error) {
    throw classify(error);
  } finally {
    await handle.close().catch(() => undefined);
  }
}
