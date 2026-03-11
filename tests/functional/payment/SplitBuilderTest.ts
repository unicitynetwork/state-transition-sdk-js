import { TestPaymentData } from './TestPaymentData.js';
import { TestSplitPaymentData } from './TestSplitPaymentData.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenAssetCountMismatchError } from '../../../src/payment/error/TokenAssetCountMismatchError.js';
import { TokenAssetMissingError } from '../../../src/payment/error/TokenAssetMissingError.js';
import { TokenAssetValueMismatchError } from '../../../src/payment/error/TokenAssetValueMismatchError.js';
import { SplitReason } from '../../../src/payment/SplitReason.js';
import { TokenSplit } from '../../../src/payment/TokenSplit.js';
import { PayToPublicKeyPredicate } from '../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateVerifier } from '../../../src/predicate/verification/PredicateVerifier.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { Address } from '../../../src/transaction/Address.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';

describe('SplitBuilder Functional Test', () => {
  it('should mint a token and split it using SplitBuilder', async () => {
    const aggregatorClient = TestAggregatorClient.create();
    const trustBase = aggregatorClient.rootTrustBase;
    const client = new StateTransitionClient(aggregatorClient);
    const predicateVerifier = PredicateVerifier.create();

    const signingService = new SigningService(SigningService.generatePrivateKey());
    const predicate = PayToPublicKeyPredicate.fromSigningService(signingService);

    const assets = [
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 500n),
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 500n),
    ];

    const paymentData = new TestPaymentData(PaymentAssetCollection.create(...assets));
    const mintTransaction = await MintTransaction.create(
      await Address.fromPredicate(predicate),
      new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      new TokenType(crypto.getRandomValues(new Uint8Array(32))),
      await paymentData.toCBOR(),
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

    await expect(
      TokenSplit.split(token, predicate, TestPaymentData.fromCBOR, [
        [new TokenId(crypto.getRandomValues(new Uint8Array(32))), PaymentAssetCollection.create(assets[0])],
      ]),
    ).rejects.toThrow(TokenAssetCountMismatchError);

    await expect(
      TokenSplit.split(token, predicate, TestPaymentData.fromCBOR, [
        [
          new TokenId(crypto.getRandomValues(new Uint8Array(32))),
          PaymentAssetCollection.create(
            assets[0],
            new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 400n),
          ),
        ],
      ]),
    ).rejects.toThrow(TokenAssetMissingError);

    await expect(
      TokenSplit.split(token, predicate, TestPaymentData.fromCBOR, [
        [
          new TokenId(crypto.getRandomValues(new Uint8Array(32))),
          PaymentAssetCollection.create(assets[0], new Asset(assets[1].id, 1500n)),
        ],
      ]),
    ).rejects.toThrow(TokenAssetValueMismatchError);

    const splitTokens: [TokenId, PaymentAssetCollection][] = [
      [new TokenId(crypto.getRandomValues(new Uint8Array(32))), PaymentAssetCollection.create(assets[0])],
      [new TokenId(crypto.getRandomValues(new Uint8Array(32))), PaymentAssetCollection.create(assets[1])],
    ];
    const result = await TokenSplit.split(token, predicate, TestPaymentData.fromCBOR, splitTokens);

    certificationData = await CertificationData.fromTransaction(
      result.burn.transaction,
      await PayToPublicKeyPredicate.generateUnlockScript(result.burn.transaction, signingService),
    );

    response = await client.submitCertificationRequest(certificationData);
    expect(response.status).toEqual(CertificationStatus.SUCCESS);

    token = await token.transfer(
      trustBase,
      predicateVerifier,
      await result.burn.transaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(trustBase, predicateVerifier, client, result.burn.transaction),
      ),
    );

    for (const [tokenId, assets] of splitTokens) {
      const entry = result.proofs.get(tokenId);
      if (entry == null) {
        throw new Error('Missing split reason proof for token.');
      }

      const paymentData = new TestSplitPaymentData(assets, SplitReason.create(token, entry.proofs));

      const mintTransaction = await MintTransaction.create(
        await Address.fromPredicate(predicate),
        tokenId,
        new TokenType(crypto.getRandomValues(new Uint8Array(32))),
        await paymentData.toCBOR(),
      );

      const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

      const response = await client.submitCertificationRequest(certificationData);
      expect(response.status).toEqual(CertificationStatus.SUCCESS);

      const splitToken = await Token.mint(
        trustBase,
        predicateVerifier,
        await mintTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(trustBase, predicateVerifier, client, mintTransaction),
        ),
      );

      await expect(
        TokenSplit.verify(
          await Token.fromCBOR(splitToken.toCBOR()),
          TestSplitPaymentData.fromCBOR,
          trustBase,
          predicateVerifier,
        ).then((result) => result.status),
      ).resolves.toEqual(VerificationStatus.OK);
    }
  });
});
