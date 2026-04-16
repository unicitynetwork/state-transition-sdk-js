import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { dedent } from '../../util/StringUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { UnicityId } from '../../unicity-id/UnicityId.js';

export class UnicityIdPredicate implements IBuiltInPredicate {
  private constructor(public readonly unicityId: UnicityId) {}

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.UnicityId;
  }

  public static create(unicityId: UnicityId): UnicityIdPredicate {
    return new UnicityIdPredicate(unicityId);
  }

  public static fromPredicate(predicate: IPredicate): UnicityIdPredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.UnicityId)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.UnicityId}.`);
    }

    return new UnicityIdPredicate(UnicityId.fromCBOR(predicate.encodeParameters()));
  }

  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  public encodeParameters(): Uint8Array {
    return this.unicityId.toCBOR();
  }

  public toString(): string {
    return dedent`
      UnicityIdPredicate
        UnicityId: 
          ${this.unicityId.toString()}`;
  }
}
