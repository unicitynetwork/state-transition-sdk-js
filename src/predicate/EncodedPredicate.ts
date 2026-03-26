import { IPredicate } from './IPredicate.js';
import { PredicateEngine } from './PredicateEngine.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

export class EncodedPredicate implements IPredicate {
  private constructor(
    public readonly engine: PredicateEngine,
    private readonly _code: Uint8Array,
    private readonly _params: Uint8Array,
  ) {
    this._code = new Uint8Array(_code);
    this._params = new Uint8Array(_params);
  }

  public static equals(a: IPredicate | null | undefined, b: IPredicate | null | undefined): boolean {
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

  public static fromCBOR(bytes: Uint8Array): EncodedPredicate {
    const data = CborDeserializer.decodeArray(bytes);
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

  public static fromPredicate(predicate: IPredicate): EncodedPredicate {
    return new EncodedPredicate(predicate.engine, predicate.encodeCode(), predicate.encodeParameters());
  }

  public encodeCode(): Uint8Array {
    return this._code.slice();
  }

  public encodeParameters(): Uint8Array {
    return this._params.slice();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.engine),
      CborSerializer.encodeByteString(this._code),
      CborSerializer.encodeByteString(this._params),
    );
  }

  public toString(): string {
    return dedent`
      EncodedPredicate:
        Engine: ${PredicateEngine[this.engine]}
        Code: ${HexConverter.encode(this._code)}
        Params: ${HexConverter.encode(this._params)}
      ]`;
  }
}
