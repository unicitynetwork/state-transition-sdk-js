import { DataHash } from '../../../crypto/hash/DataHash.js';
import { TokenId } from '../../../transaction/TokenId.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { IPredicate } from '../../IPredicate.js';
import { IPredicateVerifier } from '../../verification/IPredicateVerifier.js';
import { PredicateVerifier } from '../../verification/PredicateVerifier.js';
import { UnicityIdPredicate } from '../UnicityIdPredicate.js';
import { UnicityIdPredicateUnlockScript } from '../UnicityIdPredicateUnlockScript.js';

export class UnicityIdPredicateVerifier implements IPredicateVerifier {
  public readonly type = UnicityIdPredicate.TYPE;

  public async verify(
    verifier: PredicateVerifier,
    encodedPredicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = UnicityIdPredicate.fromCBOR(encodedPredicate.toCBOR());
    const decodedUnlockScript = await UnicityIdPredicateUnlockScript.fromCBOR(unlockScript);

    const tokenId = await TokenId.fromUnicityId(predicate.unicityId);
    if (!tokenId.equals(decodedUnlockScript.token.id)) {
      return new VerificationResult(
        'PayToPublicKeyPredicateVerifier',
        VerificationStatus.FAIL,
        'Signature verification failed.',
      );
    }

    const targetPredicateResult = await verifier.verify(
      decodedUnlockScript.token.genesis.targetPredicate,
      sourceStateHash,
      transactionHash,
      decodedUnlockScript.unlockScript,
    );

    return new VerificationResult('UnicityIdPredicateVerifier', VerificationStatus.OK);
  }
}
