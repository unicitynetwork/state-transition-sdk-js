import { IPredicateVerifierFactory } from './IPredicateVerifierFactory.js';
import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { BuiltInPredicateVerifierFactory } from '../builtin/BuiltInPredicateVerifierFactory.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

export class PredicateVerifier {
  private readonly factories: Map<PredicateEngine, IPredicateVerifierFactory> = new Map();

  private constructor() {}

  public static create(trustBase: RootTrustBase): PredicateVerifier {
    const verifier = new PredicateVerifier();
    verifier.addFactory(BuiltInPredicateVerifierFactory.create(verifier, trustBase));

    return verifier;
  }

  public addFactory(factory: IPredicateVerifierFactory): this {
    if (this.factories.has(factory.engine)) {
      throw new Error('Found duplicate predicate verifier factory.');
    }

    this.factories.set(factory.engine, factory);

    return this;
  }

  public verify(
    predicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const factory = this.factories.get(predicate.engine);
    if (!factory) {
      throw new Error('Unsupported predicate engine.');
    }

    return factory.verify(predicate, sourceStateHash, transactionHash, unlockScript);
  }
}
