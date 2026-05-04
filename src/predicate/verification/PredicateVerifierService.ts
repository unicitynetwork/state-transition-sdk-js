import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { DefaultBuiltInPredicateVerifier } from '../builtin/DefaultBuiltInPredicateVerifier.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { IPredicateVerifier } from './IPredicateVerifier.js';
import { EncodedPredicate } from '../EncodedPredicate.js';

export class PredicateVerifierService {
  private readonly verifiers: Map<PredicateEngine, IPredicateVerifier> = new Map();

  private constructor() {}

  public static create(trustBase: RootTrustBase): PredicateVerifierService {
    const verifier = new PredicateVerifierService();
    verifier.addVerifier(DefaultBuiltInPredicateVerifier.create(verifier, trustBase));

    return verifier;
  }

  public addVerifier(verifier: IPredicateVerifier): this {
    if (this.verifiers.has(verifier.engine)) {
      throw new Error(`Found duplicate predicate verifier for engine ${verifier.engine}.`);
    }

    this.verifiers.set(verifier.engine, verifier);

    return this;
  }

  public verify(
    predicate: EncodedPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const verifier = this.verifiers.get(predicate.engine);
    if (!verifier) {
      throw new Error('Unsupported predicate engine.');
    }

    return verifier.verify(predicate, sourceStateHash, transactionHash, unlockScript);
  }
}
