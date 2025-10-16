import { ISerializablePredicate } from './ISerializablePredicate.js';
import { PredicateEngineType } from './PredicateEngineType.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborError } from '../serializer/cbor/CborError.js';

export class EncodedPredicate implements ISerializablePredicate {
  public constructor(
    public readonly engine: PredicateEngineType,
    private readonly _code: Uint8Array,
    private readonly _parameters: Uint8Array,
  ) {
    this._code = _code.slice();
    this._parameters = _parameters.slice();
  }

  /**
   * Create encoded predicate from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return encoded predicate
   */
  public static fromCBOR(bytes: Uint8Array): EncodedPredicate {
    const data = CborDeserializer.readArray(bytes);

    const engine = CborDeserializer.readUnsignedInteger(data[0]);
    if (engine > Number.MAX_SAFE_INTEGER || !PredicateEngineType[Number(engine)]) {
      throw new CborError('Invalid predicate engine type');
    }

    return new EncodedPredicate(
      Number(engine) as PredicateEngineType,
      CborDeserializer.readByteString(data[1]),
      CborDeserializer.readByteString(data[2]),
    );
  }

  /**
   * Encode predicate code.
   *
   * @return encoded code
   */
  public encode(): Uint8Array {
    return this._code.slice();
  }

  /**
   * Encode predicate parameters.
   *
   * @return encoded parameters
   */
  public encodeParameters(): Uint8Array {
    return this._parameters.slice();
  }
}
