import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { UnicityIdPredicate } from '../../src/predicate/builtin/UnicityIdPredicate.js';
import { UnicityIdPredicateUnlockScript } from '../../src/predicate/builtin/UnicityIdPredicateUnlockScript.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { Address } from '../../src/transaction/Address.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenId } from '../../src/transaction/TokenId.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { UnicityId } from '../../src/unicity-id/UnicityId.js';
import { UnicityIdMintTransaction } from '../../src/unicity-id/UnicityIdMintTransaction.js';
import { UnicityIdToken } from '../../src/unicity-id/UnicityIdToken.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

export const transitionFlowTest = (client: StateTransitionClient, trustBase: RootTrustBase): void => {
  describe('Transition', () => {
    it('default successful flow', async () => {
      const predicateVerifier = PredicateVerifierService.create(trustBase);

      const unicityIdSigningService = new SigningService(SigningService.generatePrivateKey());

      const signingService = new SigningService(SigningService.generatePrivateKey());
      const targetPredicate = PayToPublicKeyPredicate.fromSigningService(signingService);

      const unicityIdMintTransaction = await UnicityIdMintTransaction.create(
        unicityIdSigningService,
        await Address.fromPredicate(targetPredicate),
        new UnicityId('unicity-labs/test', 'martti007'),
        new TokenType(crypto.getRandomValues(new Uint8Array(32))),
        targetPredicate,
      );

      const unicityIdCertificationData = await CertificationData.fromTransaction(
        unicityIdMintTransaction,
        await PayToPublicKeyPredicateUnlockScript.create(unicityIdMintTransaction, unicityIdSigningService),
      );

      const unicityIdResponse = await client.submitCertificationRequest(unicityIdCertificationData);
      expect(unicityIdResponse.status).toEqual(CertificationStatus.SUCCESS);

      const unicityIdToken = await UnicityIdToken.mint(
        trustBase,
        predicateVerifier,
        await unicityIdMintTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(trustBase, predicateVerifier, client, unicityIdMintTransaction),
        ),
      );

      const unicityIdPredicate = UnicityIdPredicate.create(
        unicityIdSigningService.publicKey,
        unicityIdMintTransaction.unicityId,
      );

      const mintTransaction = await MintTransaction.create(
        await Address.fromPredicate(unicityIdPredicate),
        new TokenId(crypto.getRandomValues(new Uint8Array(32))),
        new TokenType(crypto.getRandomValues(new Uint8Array(32))),
        CborSerializer.encodeArray(),
      );
      let certificationData = await CertificationData.fromMintTransaction(mintTransaction);

      let response = await client.submitCertificationRequest(certificationData);
      expect(response.status).toEqual(CertificationStatus.SUCCESS);

      let token = await Token.mint(
        trustBase,
        predicateVerifier,
        await mintTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(trustBase, predicateVerifier, client, mintTransaction),
        ),
      );

      const receiverSigningService = new SigningService(SigningService.generatePrivateKey());
      // Second user will generate his predicate
      const receiverPredicate = PayToPublicKeyPredicate.fromSigningService(receiverSigningService);
      // Create pay to script hash for sender
      const receiverScriptHash = await Address.fromPredicate(receiverPredicate);
      const transferTransaction = await TransferTransaction.create(
        token,
        unicityIdPredicate,
        Address.fromBytes(receiverScriptHash.bytes),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );

      await expect(
        client
          .submitCertificationRequest(
            await CertificationData.fromTransaction(
              transferTransaction,
              await UnicityIdPredicateUnlockScript.create(unicityIdToken, transferTransaction, signingService),
            ),
          )
          .then((response) => response.status),
      ).resolves.toEqual(CertificationStatus.SUCCESS);

      // Test double spend attempt
      const doubleSpendTransferTransaction = await TransferTransaction.create(
        token,
        unicityIdPredicate,
        await Address.fromPredicate(targetPredicate),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );

      await expect(
        client
          .submitCertificationRequest(
            await CertificationData.fromTransaction(
              doubleSpendTransferTransaction,
              await UnicityIdPredicateUnlockScript.create(
                unicityIdToken,
                doubleSpendTransferTransaction,
                signingService,
              ),
            ),
          )
          .then((response) => response.status),
      ).resolves.toEqual(CertificationStatus.SUCCESS);

      await expect(
        waitInclusionProof(trustBase, predicateVerifier, client, doubleSpendTransferTransaction),
      ).rejects.toThrow('Invalid inclusion proof status: TRANSACTION_HASH_MISMATCH');

      token = await token.transfer(
        trustBase,
        predicateVerifier,
        await transferTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(trustBase, predicateVerifier, client, transferTransaction),
        ),
      );

      await expect(
        Token.fromCBOR(token.toCBOR()).then((importedToken) =>
          importedToken.verify(trustBase, predicateVerifier).then((result) => result.status),
        ),
      ).resolves.toEqual(VerificationStatus.OK);

      // Return token to initial minter
      const returnTransferTransaction = await TransferTransaction.create(
        token,
        receiverPredicate,
        await Address.fromPredicate(targetPredicate),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );

      certificationData = await CertificationData.fromTransaction(
        returnTransferTransaction,
        await PayToPublicKeyPredicateUnlockScript.create(returnTransferTransaction, receiverSigningService),
      );

      response = await client.submitCertificationRequest(certificationData);
      expect(response.status).toEqual(CertificationStatus.SUCCESS);

      token = await token.transfer(
        trustBase,
        predicateVerifier,
        await returnTransferTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(trustBase, predicateVerifier, client, returnTransferTransaction),
        ),
      );

      await expect(token.verify(trustBase, predicateVerifier).then((result) => result.status)).resolves.toEqual(
        VerificationStatus.OK,
      );
    }, 30000);
  });
};
