import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';

export class BurnPredicate implements IBuiltInPredicate {
  private constructor(private readonly _reason: Uint8Array) {
    this._reason = new Uint8Array(_reason);
  }

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get reason(): Uint8Array {
    return new Uint8Array(this._reason);
  }

  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.Burn;
  }

  public static create(reason: Uint8Array): BurnPredicate {
    return new BurnPredicate(reason);
  }

  public static fromPredicate(predicate: IPredicate): BurnPredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.Burn)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.Burn}.`);
    }

    return new BurnPredicate(predicate.encodeParameters());
  }

  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  public encodeParameters(): Uint8Array {
    return this.reason;
  }

  public toString(): string {
    return dedent`
      BurnPredicate
        Reason: ${HexConverter.encode(this._reason)}`;
  }
}
