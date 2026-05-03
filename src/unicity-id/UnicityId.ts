import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { TokenId } from '../transaction/TokenId.js';

export class UnicityId {
  public constructor(
    public readonly name: string,
    public readonly domain: string | null = null,
  ) {}

  public static fromCBOR(bytes: Uint8Array): UnicityId {
    const data = CborDeserializer.decodeArray(bytes, 2);
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
    return `@${this.domain ? `${this.domain}/` : ''}${this.name}`;
  }

  public async toTokenId(): Promise<TokenId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeTextString('NAMETAG_'),
          CborSerializer.encodeNullable(this.domain, CborSerializer.encodeTextString),
          CborSerializer.encodeTextString(this.name),
        ),
      )
      .digest();

    return new TokenId(hash.data);
  }
}
