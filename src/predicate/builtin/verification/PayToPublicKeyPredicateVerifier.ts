import { DataHash } from '../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { Signature } from '../../../crypto/secp256k1/Signature.js';
import { SigningService } from '../../../crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { IPredicate } from '../../IPredicate.js';
import { IPredicateVerifier } from '../../verification/IPredicateVerifier.js';
import { PredicateVerifier } from '../../verification/PredicateVerifier.js';
import { PayToPublicKeyPredicate } from '../PayToPublicKeyPredicate.js';

export class PayToPublicKeyPredicateVerifier implements IPredicateVerifier {
  public readonly type = PayToPublicKeyPredicate.TYPE;

  public async verify(
    _: PredicateVerifier,
    encodedPredicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = PayToPublicKeyPredicate.fromCBOR(encodedPredicate.toCBOR());

    const result = await SigningService.verifyWithPublicKey(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(sourceStateHash.data),
            CborSerializer.encodeByteString(transactionHash.data),
          ),
        )
        .digest(),
      Signature.decode(unlockScript).bytes,
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
