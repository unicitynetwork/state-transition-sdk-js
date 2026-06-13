import { IBuiltInPredicateVerifier } from './IBuiltInPredicateVerifier.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { TokenId } from '../../../transaction/TokenId.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../../EncodedPredicate.js';
import { PredicateVerifierService } from '../../verification/PredicateVerifierService.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';
import { UnicityIdPredicate } from '../UnicityIdPredicate.js';
import { UnicityIdPredicateUnlockScript } from '../UnicityIdPredicateUnlockScript.js';

/**
 * Verifier for {@link UnicityIdPredicate}: confirms the unlock script
 * carries a valid unicity-id token whose id matches the predicate, then
 * recursively verifies the token's target predicate against the spend.
 */
export class UnicityIdPredicateVerifier implements IBuiltInPredicateVerifier {
  public constructor(
    private readonly verifier: PredicateVerifierService,
    private readonly trustBase: RootTrustBase,
    private readonly issuerPublicKey: Uint8Array,
  ) {}

  /**
   * @returns {BuiltInPredicateType} UnicityId predicate type id.
   */
  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.UnicityId;
  }

  /**
   * @inheritDoc
   */
  public async verify(
    encodedPredicate: EncodedPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const predicate = UnicityIdPredicate.fromPredicate(encodedPredicate);
    const decodedUnlockScript = await UnicityIdPredicateUnlockScript.decode(unlockScript);

    const tokenId = await TokenId.fromSalt(this.trustBase.networkId, await predicate.unicityId.toTokenSalt());
    if (!tokenId.equals(decodedUnlockScript.token.id)) {
      return new VerificationResult('UnicityIdPredicateVerifier', VerificationStatus.FAIL, 'Token ID mismatch.');
    }

    let result = await decodedUnlockScript.token.verify(this.trustBase, this.verifier, this.issuerPublicKey);
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
