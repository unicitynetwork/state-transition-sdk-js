import { DataHash } from '../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { Signature } from '../../../crypto/secp256k1/Signature.js';
import { SigningService } from '../../../crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../../EncodedPredicate.js';
import { SignaturePredicate } from '../SignaturePredicate.js';
import { IBuiltInPredicateVerifier } from './IBuiltInPredicateVerifier.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';

export class SignaturePredicateVerifier implements IBuiltInPredicateVerifier {
  public readonly type = BuiltInPredicateType.Signature;

  public async verify(
    encodedPredicate: EncodedPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = SignaturePredicate.fromPredicate(encodedPredicate);

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
