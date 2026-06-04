import { DataHash } from '../../crypto/hash/DataHash.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../EncodedPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { IPredicateVerifier } from '../verification/IPredicateVerifier.js';
import { IBuiltInPredicateVerifier } from './verification/IBuiltInPredicateVerifier.js';
import { SignaturePredicateVerifier } from './verification/SignaturePredicateVerifier.js';

/**
 * Default {@link IPredicateVerifier} for the built-in engine. Uses
 * {@link IBuiltInPredicateVerifier} by the predicate's type id to verify it.
 */
export class DefaultBuiltInPredicateVerifier implements IPredicateVerifier {
  public readonly engine: PredicateEngine = PredicateEngine.BUILT_IN;

  private readonly verifiers: Map<bigint, IBuiltInPredicateVerifier>;

  public constructor(verifiers: IBuiltInPredicateVerifier[]) {
    const result = new Map<bigint, IBuiltInPredicateVerifier>();
    for (const verifier of verifiers) {
      const type = BigInt(verifier.type);
      if (result.has(type)) {
        throw new Error('Found duplicate predicate verifier.');
      }

      result.set(type, verifier);
    }

    this.verifiers = result;
  }

  /**
   * Create a verifier preloaded with the default built-in predicate verifiers.
   *
   * @returns {DefaultBuiltInPredicateVerifier} New verifier.
   */
  public static create(): DefaultBuiltInPredicateVerifier {
    return new DefaultBuiltInPredicateVerifier([new SignaturePredicateVerifier()]);
  }

  /**
   * @inheritDoc
   */
  public verify(
    predicate: EncodedPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());

    const verifier = this.verifiers.get(type);
    if (!verifier) {
      throw new Error('Unsupported predicate type for verification.');
    }

    return verifier.verify(predicate, sourceStateHash, transactionHash, unlockScript);
  }
}
