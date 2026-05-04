import { CborError } from './CborError.js';
import { CborMapEntry } from './CborMapEntry.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';

export class CborMap {
  private readonly _entries: CborMapEntry[];

  public constructor(entries: CborMapEntry[]) {
    this._entries = entries.slice().sort(CborMap.compareEntries);

    for (let i = 1; i < this._entries.length; i++) {
      const prev = this._entries[i - 1].key;
      const curr = this._entries[i].key;
      if (areUint8ArraysEqual(prev, curr)) {
        throw new CborError('Duplicate map key in CborMap.');
      }
    }
  }

  /**
   * Get CBOR element list.
   *
   * @return element list
   */
  public get entries(): CborMapEntry[] {
    return this._entries.slice();
  }

  public static compareEntries(a: CborMapEntry, b: CborMapEntry): number {
    const length = Math.min(a.key.length, b.key.length);
    for (let i = 0; i < length; i++) {
      if (a.key[i] != b.key[i]) {
        return a.key[i] - b.key[i];
      }
    }

    return a.key.length - b.key.length;
  }
}
