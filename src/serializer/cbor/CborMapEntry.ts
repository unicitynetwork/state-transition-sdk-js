export class CborMapEntry {
  public constructor(
    private readonly _key: Uint8Array,
    private readonly _value: Uint8Array
  ) {
    this._key = new Uint8Array(_key);
    this._value = new Uint8Array(_value);
  }

  public get key(): Uint8Array {
    return new Uint8Array(this._key);
  }

  public get value(): Uint8Array {
    return new Uint8Array(this._value);
  }
}