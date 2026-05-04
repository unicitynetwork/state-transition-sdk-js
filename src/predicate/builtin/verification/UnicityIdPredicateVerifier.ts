import { IBuiltInPredicateVerifier } from './IBuiltInPredicateVerifier.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../../EncodedPredicate.js';
import { PredicateVerifierService } from '../../verification/PredicateVerifierService.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';
import { UnicityIdPredicate } from '../UnicityIdPredicate.js';
import { UnicityIdPredicateUnlockScript } from '../UnicityIdPredicateUnlockScript.js';

export class UnicityIdPredicateVerifier implements IBuiltInPredicateVerifier {
  public constructor(
    private readonly verifier: PredicateVerifierService,
    private readonly trustBase: RootTrustBase,
  ) {}

  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.UnicityId;
  }

  public async verify(
    encodedPredicate: EncodedPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = UnicityIdPredicate.fromPredicate(encodedPredicate);
    const decodedUnlockScript = await UnicityIdPredicateUnlockScript.decode(unlockScript);

    const tokenId = await predicate.unicityId.toTokenId();
    if (!tokenId.equals(decodedUnlockScript.token.id)) {
      return new VerificationResult('UnicityIdPredicateVerifier', VerificationStatus.FAIL, 'Token ID mismatch.');
    }

    let result = await decodedUnlockScript.token.verify(this.trustBase, this.verifier);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'UnicityIdPredicateVerifier',
        VerificationStatus.FAIL,
        'Could not verify unicity id token.',
        [result],
      );
    }

    result = await this.verifier.verify(
      EncodedPredicate.fromPredicate(decodedUnlockScript.token.genesis.targetPredicate),
      sourceStateHash,
      transactionHash,
      decodedUnlockScript.unlockScript,
    );
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'UnicityIdPredicateVerifier',
        VerificationStatus.FAIL,
        'Could not verify target predicate.',
        [result],
      );
    }

    return new VerificationResult('UnicityIdPredicateVerifier', VerificationStatus.OK);
  }
}
