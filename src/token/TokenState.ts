import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { ISerializablePredicate } from '../predicate/ISerializablePredicate.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';

/** JSON representation of {@link TokenState}. */
export interface ITokenStateJson {
  readonly predicate: string;
  readonly data: string | null;
}

/**
 * Represents a snapshot of token ownership and associated data.
 */
export class TokenState {
  /**
   * @param predicate Predicate controlling future transfers
   * @param _data           Optional encrypted state data
   */
  public constructor(
    public readonly predicate: ISerializablePredicate,
    private readonly _data: Uint8Array | null,
  ) {
    this._data = _data ? new Uint8Array(_data) : null;
  }

  /** Copy of the stored state data. */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /**
   * Create current state from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return current state
   */
  public static fromCBOR(bytes: Uint8Array): TokenState {
    const data = CborDeserializer.readArray(bytes);

    return new TokenState(
      EncodedPredicate.fromCBOR(data[0]),
      CborDeserializer.readOptional(data[1], CborDeserializer.readByteString),
    );
  }

  public static isJSON(input: unknown): input is ITokenStateJson {
    return (
      typeof input === 'object' &&
      input != null &&
      'predicate' in input &&
      typeof input.predicate === 'string' &&
      'data' in input &&
      (typeof input.data === 'string' || input.data === null)
    );
  }

  public static fromJSON(input: unknown): TokenState {
    if (!TokenState.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new TokenState(
      EncodedPredicate.fromCBOR(HexConverter.decode(input.predicate)),
      input.data ? HexConverter.decode(input.data) : null,
    );
  }

  /**
   * Convert current state to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.predicate.engine),
        CborSerializer.encodeByteString(this.predicate.encode()),
        CborSerializer.encodeByteString(this.predicate.encodeParameters()),
      ),
      CborSerializer.encodeOptional(this.data, CborSerializer.encodeByteString),
    );
  }

  public toJSON(): ITokenStateJson {
    return {
      data: this._data ? HexConverter.encode(this._data) : null,
      predicate: HexConverter.encode(
        CborSerializer.encodeArray(
          CborSerializer.encodeUnsignedInteger(this.predicate.engine),
          CborSerializer.encodeByteString(this.predicate.encode()),
          CborSerializer.encodeByteString(this.predicate.encodeParameters())
        ),
      ),
    };
  }

  /**
   * Calculate current state hash.
   *
   * @return state hash
   */
  public calculateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        TokenState:
          ${this.predicate.toString()}
          Data: ${this._data ? HexConverter.encode(this._data) : null}`;
  }
}
