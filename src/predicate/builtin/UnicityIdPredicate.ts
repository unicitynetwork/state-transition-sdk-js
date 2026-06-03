import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { dedent } from '../../util/StringUtils.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { UnicityId } from '../../unicity-id/UnicityId.js';
import { EncodedPredicate } from '../EncodedPredicate.js';

/**
 * Built-in predicate that locks a state to a specific {@link UnicityId}.
 * Spending requires presenting a matching unicity-id token in the unlock
 * script.
 */
export class UnicityIdPredicate implements IBuiltInPredicate {
  private constructor(public readonly unicityId: UnicityId) {}

  /**
   * @returns {PredicateEngine} Built-in predicate engine.
   */
  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  /**
   * @returns {BuiltInPredicateType} UnicityId predicate type id.
   */
  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.UnicityId;
  }

  /**
   * Create a UnicityIdPredicate for the given UnicityId.
   *
   * @param {UnicityId} unicityId Unicity id the state is locked to.
   * @returns {UnicityIdPredicate} New predicate.
   */
  public static create(unicityId: UnicityId): UnicityIdPredicate {
    return new UnicityIdPredicate(unicityId);
  }

  /**
   * Decode a UnicityIdPredicate from an EncodedPredicate.
   *
   * @param {EncodedPredicate} predicate Encoded predicate.
   * @returns {UnicityIdPredicate} Decoded predicate.
   * @throws {Error} If the engine or type does not match.
   */
  public static fromPredicate(predicate: EncodedPredicate): UnicityIdPredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.UnicityId)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.UnicityId}.`);
    }

    return new UnicityIdPredicate(UnicityId.fromCBOR(predicate.encodeParameters()));
  }

  /**
   * @inheritDoc
   */
  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  /**
   * @inheritDoc
   */
  public encodeParameters(): Uint8Array {
    return this.unicityId.toCBOR();
  }

  /**
   * @returns {string} String representation of the predicate.
   */
  public toString(): string {
    return dedent`
      UnicityIdPredicate
        UnicityId: 
          ${this.unicityId.toString()}`;
  }
}
