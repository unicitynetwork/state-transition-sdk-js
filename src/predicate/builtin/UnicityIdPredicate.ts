import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { UnicityId } from '../../unicity-id/UnicityId.js';

export class UnicityIdPredicate implements IBuiltInPredicate {
  private constructor(
    private readonly _publicKey: Uint8Array,
    public readonly unicityId: UnicityId,
  ) {
    this._publicKey = new Uint8Array(_publicKey);
  }

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.UnicityId;
  }

  public static create(publicKey: Uint8Array, unicityId: UnicityId): UnicityIdPredicate {
    return new UnicityIdPredicate(publicKey, unicityId);
  }

  public static fromPredicate(predicate: IPredicate): UnicityIdPredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.UnicityId)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.UnicityId}.`);
    }

    const params = CborDeserializer.decodeArray(predicate.encodeParameters());

    return new UnicityIdPredicate(CborDeserializer.decodeByteString(params[0]), UnicityId.fromCBOR(params[1]));
  }

  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  public encodeParameters(): Uint8Array {
    return CborSerializer.encodeArray(CborSerializer.encodeByteString(this._publicKey), this.unicityId.toCBOR());
  }

  public toString(): string {
    return dedent`
      UnicityIdPredicate
        Public Key: ${HexConverter.encode(this._publicKey)}
        UnicityId: 
          ${this.unicityId.toString()}`;
  }
}
