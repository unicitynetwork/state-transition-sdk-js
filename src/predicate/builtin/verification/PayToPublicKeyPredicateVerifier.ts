import { CertificationData } from '../../../api/CertificationData.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { Signature } from '../../../crypto/secp256k1/Signature.js';
import { SigningService } from '../../../crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { IPredicate } from '../../IPredicate.js';
import { IPredicateVerifier } from '../../verification/IPredicateVerifier.js';
import { PayToPublicKeyPredicate } from '../PayToPublicKeyPredicate.js';

export class PayToPublicKeyPredicateVerifier implements IPredicateVerifier {
  public readonly type = PayToPublicKeyPredicate.TYPE;

  public async verify(
    encodedPredicate: IPredicate,
    certificationData: CertificationData,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = PayToPublicKeyPredicate.decode(encodedPredicate.toCBOR());

    if (certificationData === null) {
      return new VerificationResult(
        'PayToPublicKeyPredicateVerifier',
        VerificationStatus.FAIL,
        'Certification data is missing.',
      );
    }

    const result = await SigningService.verifyWithPublicKey(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(certificationData.sourceStateHash.data),
            CborSerializer.encodeByteString(certificationData.transactionHash.data),
          ),
        )
        .digest(),
      Signature.decode(certificationData.unlockScript).bytes,
      predicate.publicKey,
    );

    if (!result) {
      return new VerificationResult(
        'PayToPublicKeyPredicateVerifier',
        VerificationStatus.FAIL,
        'Signature verification failed.',
      );
    }

    return new VerificationResult('PayToPublicKeyPredicateVerifier', VerificationStatus.OK);
  }
}
