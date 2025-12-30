import { CertificationData } from '../../api/CertificationData.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { IPredicateVerifier } from '../verification/IPredicateVerifier.js';
import { IPredicateVerifierFactory } from '../verification/IPredicateVerifierFactory.js';

export class BuiltInPredicateVerifierFactory implements IPredicateVerifierFactory {
  public constructor(private readonly factories: Map<bigint, IPredicateVerifier>) {}

  public verify(
    predicate: IPredicate,
    certificationData: CertificationData,
  ): Promise<VerificationResult<VerificationStatus>> {
    const data = CborDeserializer.decodeArray(predicate.encode());
    const type = CborDeserializer.decodeUnsignedInteger(CborDeserializer.decodeByteString(data[1]));

    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error('Unsupported predicate type for verification.');
    }

    return factory.verify(predicate, certificationData);
  }
}
