/**
 * Single key/value pair inside a {@link CborMap}. Both key and value are
 * stored as already-encoded canonical CBOR byte slices.
 */
export class CborMapEntry {
  public constructor(
    private readonly _key: Uint8Array,
    private readonly _value: Uint8Array,
  ) {
    this._key = new Uint8Array(_key);
    this._value = new Uint8Array(_value);
  }

  /**
   * @returns {Uint8Array} Copy of the encoded key bytes.
   */
  public get key(): Uint8Array {
    return new Uint8Array(this._key);
  }

  /**
   * @returns {Uint8Array} Copy of the encoded value bytes.
   */
  public get value(): Uint8Array {
    return new Uint8Array(this._value);
  }
}
