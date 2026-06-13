import { mintToken, transferToken } from './TokenUtils.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { UnicityId } from '../../src/unicity-id/UnicityId.js';
import { UnicityIdMintTransaction } from '../../src/unicity-id/UnicityIdMintTransaction.js';
import { UnicityIdToken } from '../../src/unicity-id/UnicityIdToken.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

export const transitionFlowTest = (client: StateTransitionClient, trustBase: RootTrustBase): void => {
  const ALICE_SIGNING_SERVICE = SigningService.generate();
  const BOB_SIGNING_SERVICE = SigningService.generate();
  const CAROL_SIGNING_SERVICE = SigningService.generate();

  describe('Transition', () => {
    it('default successful flow', async () => {
      const unicityIdSigningService = new SigningService(SigningService.generatePrivateKey());
      const predicateVerifier = PredicateVerifierService.create();
      const mintJustificationVerifier = new MintJustificationVerifierService();

      const targetPredicate = SignaturePredicate.create(ALICE_SIGNING_SERVICE.publicKey);

      const unicityId = new UnicityId('testuser', 'unicity-labs/test');
      const unicityIdMintTransaction = await UnicityIdMintTransaction.create(
        trustBase.networkId,
        SignaturePredicate.fromSigningService(unicityIdSigningService),
        targetPredicate,
        unicityId,
        TokenType.generate(),
        targetPredicate,
      );

      const unicityIdCertificationData = await CertificationData.fromTransaction(
        unicityIdMintTransaction,
        await SignaturePredicateUnlockScript.create(unicityIdMintTransaction, unicityIdSigningService),
      );

      const unicityIdResponse = await client.submitCertificationRequest(unicityIdCertificationData);
      expect(unicityIdResponse.status).toEqual(CertificationStatus.SUCCESS);

      const aliceUnicityIdToken = await UnicityIdToken.mint(
        trustBase,
        predicateVerifier,
        await unicityIdMintTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(client, trustBase, predicateVerifier, unicityIdMintTransaction),
        ),
      );
      await expect(
        aliceUnicityIdToken
          .verify(trustBase, predicateVerifier, unicityIdSigningService.publicKey)
          .then((result) => result.status),
      ).resolves.toEqual(VerificationStatus.OK);

      const aliceToken = await mintToken(
        client,
        trustBase,
        predicateVerifier,
        mintJustificationVerifier,
        aliceUnicityIdToken.genesis.targetPredicate,
        null,
        trustBase.networkId,
      );

      const bobToken = await transferToken(
        client,
        trustBase,
        predicateVerifier,
        mintJustificationVerifier,
        aliceToken.toCBOR(),
        SignaturePredicate.create(BOB_SIGNING_SERVICE.publicKey),
        ALICE_SIGNING_SERVICE,
      );

      const carolToken = await transferToken(
        client,
        trustBase,
        predicateVerifier,
        mintJustificationVerifier,
        bobToken.toCBOR(),
        SignaturePredicate.create(CAROL_SIGNING_SERVICE.publicKey),
        BOB_SIGNING_SERVICE,
      );

      await expect(
        carolToken.verify(trustBase, predicateVerifier, mintJustificationVerifier).then((result) => result.status),
      ).resolves.toEqual(VerificationStatus.OK);
    }, 30000);
  });
};
