import { InvalidJsonStructureError } from '../src/InvalidJsonStructureError.js';
import { ISerializable } from '../src/ISerializable.js';
import { HexConverter } from '../src/util/HexConverter.js';
import { dedent } from '../src/util/StringUtils.js';

export class TestTokenData implements ISerializable {
  public constructor(private readonly _data: Uint8Array) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public static fromJSON(data: unknown): Promise<TestTokenData> {
    if (typeof data !== 'string') {
      throw new InvalidJsonStructureError();
    }

    return Promise.resolve(new TestTokenData(HexConverter.decode(data)));
  }

  public toJSON(): string {
    return HexConverter.encode(this._data);
  }

  public toCBOR(): Uint8Array {
    return this.data;
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      TestTokenData: ${HexConverter.encode(this.data)}`;
  }
}
