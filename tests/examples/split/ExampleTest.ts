import config from './config.json' with { type: 'json' };
import { CustomPaymentData } from './CustomPaymentData.js';
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { SplitMintJustification } from '../../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../../src/payment/SplitMintJustificationVerifier.js';
import { TokenSplit } from '../../../src/payment/TokenSplit.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
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
  const mintTransaction = await MintTransaction.create(
    ownerPredicate,
    TokenId.generate(),
    TokenType.generate(),
    null,
    await paymentData.encode(),
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

  const splitTokens: [TokenId, PaymentAssetCollection][] = [
    [TokenId.generate(), PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n))],
    [TokenId.generate(), PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n))],
    [TokenId.generate(), PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('USD')), 500n))],
  ];

  const result = await TokenSplit.split(token, CustomPaymentData.decode, splitTokens);

  response = await client.submitCertificationRequest(
    await CertificationData.fromTransaction(
      result.burn.transaction,
      await PayToPublicKeyPredicateUnlockScript.create(result.burn.transaction, ownerSigningService),
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
  for (const [tokenId, assets] of splitTokens) {
    const entry = result.proofs.get(tokenId);
    if (entry == null) {
      throw new Error('Missing split reason proof for token.');
    }

    const splitPaymentData = new CustomPaymentData(assets, 'split token');

    const mintTransaction = await MintTransaction.create(
      ownerPredicate,
      tokenId,
      TokenType.generate(),
      SplitMintJustification.create(burntToken, entry.proofs).toCBOR(),
      await splitPaymentData.encode(),
    );

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

    const response = await client.submitCertificationRequest(certificationData);
    if (response.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Token certification failed: ${response.status}`);
    }

    const splitToken = await Token.mint(
      trustBase,
      predicateVerifier,
      mintJustificationVerifier,
      await mintTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(client, trustBase, predicateVerifier, mintTransaction),
      ),
    );

    console.log(`Token[${i++}]: `, HexConverter.encode(splitToken.toCBOR()), '\n');
  }
}, 30000);
