import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

export class UnicityId {
  public constructor(
    public readonly name: string,
    public readonly domain: string | null = null,
  ) {}

  public static fromCBOR(bytes: Uint8Array): UnicityId {
    const data = CborDeserializer.decodeArray(bytes);
    return new UnicityId(
      CborDeserializer.decodeTextString(data[0]),
      CborDeserializer.decodeNullable(data[1], CborDeserializer.decodeTextString),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeTextString(this.name),
      CborSerializer.encodeNullable(this.domain, CborSerializer.encodeTextString),
    );
  }

  public toString(): string {
    return `@${this.domain ?? ''}/${this.name}`;
  }
}
