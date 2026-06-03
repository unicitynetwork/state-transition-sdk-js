import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { EncodedPredicate } from '../EncodedPredicate.js';

/**
 * Built-in predicate that permanently locks a state. The `reason` payload
 * records why the token was burned and is never spendable.
 */
export class BurnPredicate implements IBuiltInPredicate {
  private constructor(private readonly _reason: Uint8Array) {
    this._reason = new Uint8Array(_reason);
  }

  /**
   * @returns {PredicateEngine} Built-in predicate engine.
   */
  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  /**
   * @returns {Uint8Array} Copy of the burn reason bytes.
   */
  public get reason(): Uint8Array {
    return new Uint8Array(this._reason);
  }

  /**
   * @returns {BuiltInPredicateType} Burn predicate type id.
   */
  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.Burn;
  }

  /**
   * Create a BurnPredicate with the given reason payload.
   *
   * @param {Uint8Array} reason Reason bytes recorded with the burn.
   * @returns {BurnPredicate} New predicate.
   */
  public static create(reason: Uint8Array): BurnPredicate {
    return new BurnPredicate(reason);
  }

  /**
   * Decode a BurnPredicate from an EncodedPredicate.
   *
   * @param {EncodedPredicate} predicate Encoded predicate.
   * @returns {BurnPredicate} Decoded predicate.
   * @throws {Error} If the engine or type does not match.
   */
  public static fromPredicate(predicate: EncodedPredicate): BurnPredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.Burn)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.Burn}.`);
    }

    return new BurnPredicate(predicate.encodeParameters());
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
    return this.reason;
  }

  /**
   * @returns {string} String representation of the predicate.
   */
  public toString(): string {
    return dedent`
      BurnPredicate
        Reason: ${HexConverter.encode(this._reason)}`;
  }
}
