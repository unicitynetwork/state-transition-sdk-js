import { CborMapEntry } from './CborMapEntry.js';

export class CborMap {
  private readonly _entries: CborMapEntry[];

  public constructor(entries: CborMapEntry[]) {
    this._entries = entries.slice();
    this._entries.sort((a, b) => {
      if (a.key.length != b.key.length) {
        return a.key.length - b.key.length;
      }

      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] != b.key[i]) {
          return a.key[i] - b.key[i];
        }
      }

      return 0;
    });
  }

  /**
   * Get CBOR element list.
   *
   * @return element list
   */
  public get entries(): CborMapEntry[] {
    return this._entries.slice();
  }
}
