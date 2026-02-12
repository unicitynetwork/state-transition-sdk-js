import { CertificationData } from '../../api/CertificationData.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { IPredicateVerifier } from '../verification/IPredicateVerifier.js';
import { IPredicateVerifierFactory } from '../verification/IPredicateVerifierFactory.js';
import { PayToPublicKeyPredicateVerifier } from './verification/PayToPublicKeyPredicateVerifier.js';

export class BuiltInPredicateVerifierFactory implements IPredicateVerifierFactory {
  public readonly engine: PredicateEngine = PredicateEngine.BUILT_IN;

  private readonly factories: Map<bigint, IPredicateVerifier>;
  public constructor(factories: IPredicateVerifier[]) {
    const result = new Map<bigint, IPredicateVerifier>();
    for (const factory of factories) {
      if (result.has(factory.type)) {
        throw new Error('Found duplicate predicate verifier.');
      }

      result.set(factory.type, factory);
    }

    this.factories = result;
  }

  public static create(): BuiltInPredicateVerifierFactory {
    return new BuiltInPredicateVerifierFactory([new PayToPublicKeyPredicateVerifier()]);
  }

  public verify(
    predicate: IPredicate,
    certificationData: CertificationData,
  ): Promise<VerificationResult<VerificationStatus>> {
    const data = CborDeserializer.decodeArray(predicate.toCBOR());
    const type = CborDeserializer.decodeUnsignedInteger(CborDeserializer.decodeByteString(data[1]));

    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error('Unsupported predicate type for verification.');
    }

    return factory.verify(predicate, certificationData);
  }
}
