import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { TokenId } from '../transaction/TokenId.js';

/**
 * Human-readable identifier (`@domain/name`) people use to send tokens.
 * The bound {@link TokenId} can be derived from it via {@link toTokenId}.
 */
export class UnicityId {
  public constructor(
    public readonly name: string,
    public readonly domain: string | null = null,
  ) {}

  /**
   * Create UnicityId from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {UnicityId} Decoded unicity id.
   */
  public static fromCBOR(bytes: Uint8Array): UnicityId {
    const data = CborDeserializer.decodeArray(bytes, 2);
    return new UnicityId(
      CborDeserializer.decodeTextString(data[0]),
      CborDeserializer.decodeNullable(data[1], CborDeserializer.decodeTextString),
    );
  }

  /**
   * Convert UnicityId to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeTextString(this.name),
      CborSerializer.encodeNullable(this.domain, CborSerializer.encodeTextString),
    );
  }

  /**
   * @returns {string} `@domain/name` representation of the unicity id.
   */
  public toString(): string {
    return `@${this.domain ? `${this.domain}/` : ''}${this.name}`;
  }

  /**
   * Derive the {@link TokenId} bound to this unicity id.
   *
   * @returns {Promise<TokenId>} Derived token id.
   */
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
