import { EmbeddedPredicateEngine } from './embedded/EmbeddedPredicateEngine.js';
import { IPredicate } from './IPredicate.js';
import { IPredicateEngine } from './IPredicateEngine.js';
import { ISerializablePredicate } from './ISerializablePredicate.js';
import { PredicateEngineType } from './PredicateEngineType.js';

/**
 * Predefined predicate engines service to create predicates.
 */
export class PredicateEngineService {
  private static readonly ENGINES: Map<PredicateEngineType, IPredicateEngine> = new Map([
    [PredicateEngineType.EMBEDDED, new EmbeddedPredicateEngine()],
  ]);

  /**
   * Create predicate from serializable predicate.
   *
   * @param predicate serializable predicate
   * @return parsed predicate
   */
  public static createPredicate(predicate: ISerializablePredicate): Promise<IPredicate> {
    const engine = PredicateEngineService.ENGINES.get(predicate.engine);
    if (engine == null) {
      throw new Error(`Unsupported predicate engine type: ${predicate.engine}`);
    }

    return engine.create(predicate);
  }
}
