import config from './config.json' with { type: 'json' };
import { CustomPaymentData } from './CustomPaymentData.js';
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { SplitMintJustification } from '../../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../../src/payment/SplitMintJustificationVerifier.js';
import { SplitTokenRequest } from '../../../src/payment/SplitTokenRequest.js';
import { TokenSplit } from '../../../src/payment/TokenSplit.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { MintJustificationVerifierService } from '../../../src/transaction/verification/MintJustificationVerifierService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

it('Token splitting', async () => {
  const aggregatorClient = new AggregatorClient(config.aggregatorUrl);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);

  const client = new StateTransitionClient(aggregatorClient);

  const predicateVerifier = PredicateVerifierService.create();
  const mintJustificationVerifier = new MintJustificationVerifierService();
  mintJustificationVerifier.register(
    new SplitMintJustificationVerifier(trustBase, predicateVerifier, CustomPaymentData.decode),
  );

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);
  const ownerPredicate = SignaturePredicate.fromSigningService(ownerSigningService);

  const textEncoder = new TextEncoder();

  const assets = [
    new Asset(new AssetId(textEncoder.encode('EUR')), 300n),
    new Asset(new AssetId(textEncoder.encode('USD')), 500n),
  ];

  const paymentData = new CustomPaymentData(PaymentAssetCollection.create(...assets), 'my other data');
  const networkId = NetworkId.LOCAL;
  const mintTransaction = await MintTransaction.create(
    networkId,
    ownerPredicate,
    await paymentData.encode(),
    TokenType.generate(),
  );

  let response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(mintTransaction));
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Token mint certification failed: ${response.status}`);
  }

  const token = await Token.mint(
    trustBase,
    predicateVerifier,
    mintJustificationVerifier,
    await mintTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, mintTransaction),
    ),
  );

  const requests = [
    SplitTokenRequest.create(
      ownerPredicate,
      PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n)),
    ),
    SplitTokenRequest.create(
      ownerPredicate,
      PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n)),
    ),
    SplitTokenRequest.create(
      ownerPredicate,
      PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('USD')), 500n)),
    ),
  ];

  const result = await TokenSplit.split(token, CustomPaymentData.decode, requests);

  response = await client.submitCertificationRequest(
    await CertificationData.fromTransaction(
      result.burn.transaction,
      await SignaturePredicateUnlockScript.create(result.burn.transaction, ownerSigningService),
    ),
  );

  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Token certification failed: ${response.status}`);
  }

  const burntToken = await token.transfer(
    trustBase,
    predicateVerifier,
    await result.burn.transaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, result.burn.transaction),
    ),
  );

  let i = 1;
  for (const splitToken of result.tokens) {
    const splitPaymentData = new CustomPaymentData(splitToken.assets, 'split token');

    const mintTransaction = await MintTransaction.create(
      splitToken.networkId,
      splitToken.recipient,
      await splitPaymentData.encode(),
      splitToken.tokenType,
      splitToken.salt,
      SplitMintJustification.create(burntToken, splitToken.proofs).toCBOR(),
    );

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

    const response = await client.submitCertificationRequest(certificationData);
    if (response.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Token certification failed: ${response.status}`);
    }

    const mintedSplitToken = await Token.mint(
      trustBase,
      predicateVerifier,
      mintJustificationVerifier,
      await mintTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(client, trustBase, predicateVerifier, mintTransaction),
      ),
    );

    console.log(`Token[${i++}]: `, HexConverter.encode(mintedSplitToken.toCBOR()), '\n');
  }
}, 30000);
