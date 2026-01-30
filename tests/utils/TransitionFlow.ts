import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { BuiltInPredicateVerifierFactory } from '../../src/predicate/builtin/BuiltInPredicateVerifierFactory.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateEngine } from '../../src/predicate/PredicateEngine.js';
import { PredicateVerifier } from '../../src/predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../src/transaction/PayToScriptHash.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenId } from '../../src/transaction/TokenId.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

export const transitionFlowTest = (client: StateTransitionClient, trustBase: RootTrustBase): void => {
  describe('Transition', () => {
    it('default successful flow', async () => {
      const predicateVerifier = new PredicateVerifier(
        new Map([[PredicateEngine.BUILT_IN, BuiltInPredicateVerifierFactory.create()]]),
      );

      const signingService = new SigningService(SigningService.generatePrivateKey());
      const predicate = PayToPublicKeyPredicate.create(signingService);

      const mintTransaction = await MintTransaction.create(
        await PayToScriptHash.create(predicate),
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
      const receiverPredicate = PayToPublicKeyPredicate.create(receiverSigningService);
      // Create pay to script hash for sender
      const receiverScriptHash = await PayToScriptHash.create(receiverPredicate);
      const transferTransaction = await TransferTransaction.create(
        token,
        predicate,
        await PayToScriptHash.fromString(receiverScriptHash.toString()),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );

      certificationData = await CertificationData.fromTransferTransaction(
        transferTransaction,
        await PayToPublicKeyPredicate.generateUnlockScript(transferTransaction, signingService),
      );

      await expect(
        client
          .submitCertificationRequest(
            await CertificationData.fromTransferTransaction(
              transferTransaction,
              await PayToPublicKeyPredicate.generateUnlockScript(transferTransaction, signingService),
            ),
          )
          .then((response) => response.status),
      ).resolves.toEqual(CertificationStatus.SUCCESS);

      // Test double spend attempt
      const doubleSpendTransferTransaction = await TransferTransaction.create(
        token,
        predicate,
        await PayToScriptHash.create(predicate),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );

      await expect(
        client
          .submitCertificationRequest(
            await CertificationData.fromTransferTransaction(
              doubleSpendTransferTransaction,
              await PayToPublicKeyPredicate.generateUnlockScript(doubleSpendTransferTransaction, signingService),
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
        await PayToScriptHash.create(predicate),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );

      certificationData = await CertificationData.fromTransferTransaction(
        returnTransferTransaction,
        await PayToPublicKeyPredicate.generateUnlockScript(returnTransferTransaction, receiverSigningService),
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
