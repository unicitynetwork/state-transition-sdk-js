import { IPredicate } from '../IPredicate.js';
import { ISerializablePredicate } from '../ISerializablePredicate.js';
import { BurnPredicate } from './BurnPredicate.js';
import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { MaskedPredicate } from './MaskedPredicate.js';
import { UnmaskedPredicate } from './UnmaskedPredicate.js';
import { IPredicateEngine } from '../IPredicateEngine.js';

/**
 * Embedded predicate engine implementation.
 */
export class EmbeddedPredicateEngine implements IPredicateEngine {
  /**
   * Create predicate from embedded predicate engine.
   *
   * @param predicate serializable predicate.
   * @return predicate
   */
  public create(predicate: ISerializablePredicate): Promise<IPredicate> {
    const type = predicate.encode().at(0);
    switch (type) {
      case EmbeddedPredicateType.MASKED:
        if (predicate instanceof MaskedPredicate) {
          return Promise.resolve(predicate as IPredicate);
        }

        return Promise.resolve(MaskedPredicate.fromCBOR(predicate.encodeParameters()));
      case EmbeddedPredicateType.UNMASKED:
        if (predicate instanceof UnmaskedPredicate) {
          return Promise.resolve(predicate as IPredicate);
        }

        return Promise.resolve(UnmaskedPredicate.fromCBOR(predicate.encodeParameters()));
      case EmbeddedPredicateType.BURN:
        if (predicate instanceof BurnPredicate) {
          return Promise.resolve(predicate as IPredicate);
        }

        return Promise.resolve(BurnPredicate.fromCBOR(predicate.encodeParameters()));
      default:
        throw new Error(`Unsupported embedded predicate type ${type}`);
    }
  }
}
