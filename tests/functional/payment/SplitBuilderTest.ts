import { TestPaymentData } from './TestPaymentData.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenAssetCountMismatchError } from '../../../src/payment/error/TokenAssetCountMismatchError.js';
import { TokenAssetMissingError } from '../../../src/payment/error/TokenAssetMissingError.js';
import { TokenAssetValueMismatchError } from '../../../src/payment/error/TokenAssetValueMismatchError.js';
import { SplitMintJustification } from '../../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../../src/payment/SplitMintJustificationVerifier.js';
import { SplitTokenRequest } from '../../../src/payment/SplitTokenRequest.js';
import { TokenSplit } from '../../../src/payment/TokenSplit.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { StateMask } from '../../../src/transaction/StateMask.js';
import { Token } from '../../../src/transaction/Token.js';
import { MintJustificationVerifierService } from '../../../src/transaction/verification/MintJustificationVerifierService.js';
import { VerificationContext } from '../../../src/transaction/verification/VerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';

describe('SplitBuilder Functional Test', () => {
  it('should mint a token and split it using SplitBuilder', async () => {
    const aggregatorClient = TestAggregatorClient.create();
    const trustBase = aggregatorClient.rootTrustBase;
    const client = new StateTransitionClient(aggregatorClient);
    const predicateVerifier = PredicateVerifierService.create();
    const mintJustificationVerifier = new MintJustificationVerifierService();
    mintJustificationVerifier.register(new SplitMintJustificationVerifier(TestPaymentData.decode));
    const verificationContext = new VerificationContext(trustBase, predicateVerifier, mintJustificationVerifier);

    const signingService = new SigningService(SigningService.generatePrivateKey());
    const predicate = SignaturePredicate.fromSigningService(signingService);

    const assets = [
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 500n),
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 500n),
    ];

    const paymentData = new TestPaymentData(PaymentAssetCollection.create(...assets));
    const networkId = NetworkId.LOCAL;
    const mintTransaction = await MintTransaction.create(networkId, predicate, await paymentData.encode());
    let certificationData = await CertificationData.fromMintTransaction(mintTransaction);

    let response = await client.submitCertificationRequest(certificationData);
    expect(response.status).toEqual(CertificationStatus.SUCCESS);

    let token = await Token.mint(
      await mintTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(client, trustBase, predicateVerifier, mintTransaction),
      ),
      verificationContext,
    );

    await expect(
      TokenSplit.split(token, TestPaymentData.decode, [
        SplitTokenRequest.create(predicate, new TestPaymentData(PaymentAssetCollection.create(assets[0]))),
      ]),
    ).rejects.toThrow(TokenAssetCountMismatchError);

    await expect(
      TokenSplit.split(token, TestPaymentData.decode, [
        SplitTokenRequest.create(
          predicate,
          new TestPaymentData(
            PaymentAssetCollection.create(
              assets[0],
              new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 400n),
            ),
          ),
        ),
      ]),
    ).rejects.toThrow(TokenAssetMissingError);

    await expect(
      TokenSplit.split(token, TestPaymentData.decode, [
        SplitTokenRequest.create(
          predicate,
          new TestPaymentData(PaymentAssetCollection.create(assets[0], new Asset(assets[1].id, 1500n))),
        ),
      ]),
    ).rejects.toThrow(TokenAssetValueMismatchError);

    const requests = [
      SplitTokenRequest.create(predicate, new TestPaymentData(PaymentAssetCollection.create(assets[0]))),
      SplitTokenRequest.create(predicate, new TestPaymentData(PaymentAssetCollection.create(assets[1]))),
    ];
    const result = await TokenSplit.split(token, TestPaymentData.decode, requests);

    certificationData = await CertificationData.fromTransaction(
      result.burn.transaction,
      await SignaturePredicateUnlockScript.create(result.burn.transaction, signingService),
    );

    response = await client.submitCertificationRequest(certificationData);
    expect(response.status).toEqual(CertificationStatus.SUCCESS);

    token = await token.transfer(
      await result.burn.transaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(client, trustBase, predicateVerifier, result.burn.transaction),
      ),
      verificationContext,
    );

    for (const splitToken of result.tokens) {
      const mintTransaction = await MintTransaction.create(
        splitToken.networkId,
        splitToken.recipient,
        await splitToken.paymentData.encode(),
        splitToken.tokenType,
        splitToken.salt,
        SplitMintJustification.create(token, splitToken.proofs).toCBOR(),
      );

      const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

      const response = await client.submitCertificationRequest(certificationData);
      expect(response.status).toEqual(CertificationStatus.SUCCESS);

      const mintedSplitToken = await Token.mint(
        await mintTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          await waitInclusionProof(client, trustBase, predicateVerifier, mintTransaction),
        ),
        verificationContext,
      );

      await expect(
        Token.fromCBOR(mintedSplitToken.toCBOR())
          .then((token) => token.verify(verificationContext))
          .then((result) => result.status),
      ).resolves.toEqual(VerificationStatus.OK);
    }
  });

  it('should rebuild a byte-identical burn transaction from a caller-supplied burn state mask', async () => {
    const aggregatorClient = TestAggregatorClient.create();
    const trustBase = aggregatorClient.rootTrustBase;
    const client = new StateTransitionClient(aggregatorClient);
    const predicateVerifier = PredicateVerifierService.create();
    const mintJustificationVerifier = new MintJustificationVerifierService();
    mintJustificationVerifier.register(new SplitMintJustificationVerifier(TestPaymentData.decode));
    const verificationContext = new VerificationContext(trustBase, predicateVerifier, mintJustificationVerifier);

    const signingService = new SigningService(SigningService.generatePrivateKey());
    const predicate = SignaturePredicate.fromSigningService(signingService);
    const assets = [new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 500n)];
    const paymentData = new TestPaymentData(PaymentAssetCollection.create(...assets));
    const mintTransaction = await MintTransaction.create(NetworkId.LOCAL, predicate, await paymentData.encode());

    const response = await client.submitCertificationRequest(
      await CertificationData.fromMintTransaction(mintTransaction),
    );
    expect(response.status).toEqual(CertificationStatus.SUCCESS);

    const token = await Token.mint(
      await mintTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(client, trustBase, predicateVerifier, mintTransaction),
      ),
      verificationContext,
    );

    // Identical requests across all calls; only the burn mask determines reproducibility.
    const requests = [
      SplitTokenRequest.create(predicate, new TestPaymentData(PaymentAssetCollection.create(assets[0]))),
    ];
    const burnStateMask = StateMask.generate();

    const first = await TokenSplit.split(token, TestPaymentData.decode, requests, burnStateMask);
    const second = await TokenSplit.split(token, TestPaymentData.decode, requests, burnStateMask);
    const defaulted = await TokenSplit.split(token, TestPaymentData.decode, requests);

    const firstBurn = HexConverter.encode(first.burn.transaction.toCBOR());
    expect(HexConverter.encode(second.burn.transaction.toCBOR())).toEqual(firstBurn);
    // The default stays random — omitting the mask must not become deterministic.
    expect(HexConverter.encode(defaulted.burn.transaction.toCBOR())).not.toEqual(firstBurn);

    // A mask of the wrong length is a caller bug — the StateMask type rejects it at construction.
    expect(() => StateMask.fromBytes(crypto.getRandomValues(new Uint8Array(31)))).toThrow();
  });
});
