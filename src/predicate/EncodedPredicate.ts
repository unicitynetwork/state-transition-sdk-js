import { IPredicate } from './IPredicate.js';
import { PredicateEngine } from './PredicateEngine.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * Wire-form predicate: holds the engine id and opaque code/parameter bytes
 * without re-decoding them. Used wherever predicates are stored or
 * transmitted as CBOR.
 */
export class EncodedPredicate implements IPredicate {
  public static readonly CBOR_TAG = 39032n;

  private constructor(
    public readonly engine: PredicateEngine,
    private readonly _code: Uint8Array,
    private readonly _params: Uint8Array,
  ) {
    this._code = new Uint8Array(_code);
    this._params = new Uint8Array(_params);
  }

  /**
   * Null-safe structural equality on engine, code, and parameters.
   *
   * @param {EncodedPredicate|null|undefined} a First predicate.
   * @param {EncodedPredicate|null|undefined} b Second predicate.
   * @returns {boolean} True if both are nullish, or if engines and bytes match.
   */
  public static equals(a: EncodedPredicate | null | undefined, b: EncodedPredicate | null | undefined): boolean {
    if (a == null || b == null) {
      return a == null && b == null;
    }

    if (a.engine !== b.engine) {
      return false;
    }

    return (
      areUint8ArraysEqual(a.encodeCode(), b.encodeCode()) &&
      areUint8ArraysEqual(a.encodeParameters(), b.encodeParameters())
    );
  }

  /**
   * Create EncodedPredicate from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {EncodedPredicate} Decoded predicate.
   * @throws {CborError} On wrong tag or unknown engine.
   */
  public static fromCBOR(bytes: Uint8Array): EncodedPredicate {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== EncodedPredicate.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for Predicate: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 3);
    const engine = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (engine > BigInt(Number.MAX_SAFE_INTEGER) || !PredicateEngine[Number(engine)]) {
      throw new CborError('Invalid predicate engine.');
    }

    return new EncodedPredicate(
      Number(engine),
      CborDeserializer.decodeByteString(data[1]),
      CborDeserializer.decodeByteString(data[2]),
    );
  }

  /**
   * Wrap any {@link IPredicate} into its encoded form.
   *
   * @param {IPredicate} predicate Predicate to wrap.
   * @returns {EncodedPredicate} Encoded copy of the predicate.
   */
  public static fromPredicate(predicate: IPredicate): EncodedPredicate {
    return new EncodedPredicate(predicate.engine, predicate.encodeCode(), predicate.encodeParameters());
  }

  /**
   * @inheritDoc
   */
  public encodeCode(): Uint8Array {
    return this._code.slice();
  }

  /**
   * @inheritDoc
   */
  public encodeParameters(): Uint8Array {
    return this._params.slice();
  }

  /**
   * Convert EncodedPredicate to CBOR bytes.
   *
   * @returns {Uint8Array} Tagged CBOR encoding of this predicate.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      EncodedPredicate.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.engine),
        CborSerializer.encodeByteString(this._code),
        CborSerializer.encodeByteString(this._params),
      ),
    );
  }

  /**
   * @returns {string} String representation of the predicate.
   */
  public toString(): string {
    return dedent`
      EncodedPredicate:
        Engine: ${PredicateEngine[this.engine]}
        Code: ${HexConverter.encode(this._code)}
        Params: ${HexConverter.encode(this._params)}
      ]`;
  }
}
