import { IPredicate } from '../../../predicate/IPredicate.js';
import { PredicateEngine } from '../../../predicate/PredicateEngine.js';
import { CborDeserializer } from '../../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../serialization/HexConverter.js';
import { dedent } from '../../../util/StringUtils.js';

export class BurnPredicate implements IPredicate {
  public static readonly TYPE: bigint = 0x02n;

  private constructor(private readonly _reason: Uint8Array) {
    this._reason = new Uint8Array(_reason);
  }

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get reason(): Uint8Array {
    return new Uint8Array(this._reason);
  }

  public get type(): bigint {
    return BurnPredicate.TYPE;
  }

  public static create(reason: Uint8Array): BurnPredicate {
    return new BurnPredicate(reason);
  }

  public static decode(bytes: Uint8Array): BurnPredicate {
    const data = CborDeserializer.decodeArray(bytes);
    const engine = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (engine !== BigInt(PredicateEngine.BUILT_IN)) {
      throw new Error('Invalid predicate engine for BurnPredicate.');
    }

    const type = CborDeserializer.decodeUnsignedInteger(CborDeserializer.decodeByteString(data[1]));
    if (type !== BurnPredicate.TYPE) {
      throw new Error('Invalid predicate type for BurnPredicate.');
    }

    return new BurnPredicate(CborDeserializer.decodeByteString(data[2]));
  }

  public static generateUnlockScript(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(0));
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(BigInt(this.engine)),
      CborSerializer.encodeByteString(CborSerializer.encodeUnsignedInteger(this.type)),
      CborSerializer.encodeByteString(this._reason),
    );
  }

  public toString(): string {
    return dedent`
      BurnPredicate
        Reason: ${HexConverter.encode(this._reason)}`;
  }
}
