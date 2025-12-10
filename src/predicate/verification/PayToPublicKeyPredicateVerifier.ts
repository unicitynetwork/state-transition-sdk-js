import { IPredicateVerifier } from './IPredicateVerifier.js';
import { InclusionProof } from '../../api/InclusionProof.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { Signature } from '../../crypto/secp256k1/Signature.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PayToPublicKeyPredicate } from '../PayToPublicKeyPredicate.js';

export class PayToPublicKeyPredicateVerifier implements IPredicateVerifier {
  public async verify(
    encodedPredicate: IPredicate,
    inclusionProof: InclusionProof,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = PayToPublicKeyPredicate.decode(encodedPredicate.encode());

    const certificationData = inclusionProof.certificationData;
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
            certificationData.sourceStateHash.toCBOR(),
            certificationData.transactionHash.toCBOR(),
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
