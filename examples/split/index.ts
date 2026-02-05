import config from './config.json' with { type: 'json' };
import { CustomPaymentData } from './CustomPaymentData.js';
import { CustomSplitPaymentData } from './CustomSplitPaymentData.js';
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../src/payment/asset/Asset.js';
import { AssetId } from '../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../src/payment/asset/PaymentAssetCollection.js';
import { SplitReason } from '../../src/payment/SplitReason.js';
import { TokenSplit } from '../../src/payment/TokenSplit.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateVerifier } from '../../src/predicate/verification/PredicateVerifier.js';
import { HexConverter } from '../../src/serialization/HexConverter.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../src/transaction/PayToScriptHash.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenId } from '../../src/transaction/TokenId.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

const aggregatorClient = new AggregatorClient('http://localhost:3000');
const trustBase = RootTrustBase.fromJSON(trustBaseJson);

const client = new StateTransitionClient(aggregatorClient);

const predicateVerifier = PredicateVerifier.create();

const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
const ownerSigningService = new SigningService(ownerPrivateKey);
const ownerPredicate = PayToPublicKeyPredicate.create(ownerSigningService);

const textEncoder = new TextEncoder();

const assets = [
  new Asset(new AssetId(textEncoder.encode('EUR')), 300n),
  new Asset(new AssetId(textEncoder.encode('USD')), 500n),
];

const paymentData = new CustomPaymentData(PaymentAssetCollection.create(...assets), 'my other data');
const mintTransaction = await MintTransaction.create(
  await PayToScriptHash.create(ownerPredicate),
  new TokenId(crypto.getRandomValues(new Uint8Array(32))),
  new TokenType(crypto.getRandomValues(new Uint8Array(32))),
  await paymentData.toCBOR(),
);

let response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(mintTransaction));
if (response.status !== CertificationStatus.SUCCESS) {
  throw new Error(`Token mint certification failed: ${response.status}`);
}

const token = await Token.mint(
  trustBase,
  predicateVerifier,
  await mintTransaction.toCertifiedTransaction(
    trustBase,
    predicateVerifier,
    await waitInclusionProof(trustBase, predicateVerifier, client, mintTransaction),
  ),
);

const splitTokens: [TokenId, PaymentAssetCollection][] = [
  [
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n)),
  ],
  [
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('EUR')), 150n)),
  ],
  [
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    PaymentAssetCollection.create(new Asset(new AssetId(textEncoder.encode('USD')), 500n)),
  ],
];

const result = await TokenSplit.split(token, ownerPredicate, CustomPaymentData.fromCBOR, splitTokens);

response = await client.submitCertificationRequest(
  await CertificationData.fromTransferTransaction(
    result.burn.transaction,
    await PayToPublicKeyPredicate.generateUnlockScript(result.burn.transaction, ownerSigningService),
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
    await waitInclusionProof(trustBase, predicateVerifier, client, result.burn.transaction),
  ),
);

let i = 1;
for (const [tokenId, assets] of splitTokens) {
  const entry = result.proofs.get(tokenId);
  if (entry == null) {
    throw new Error('Missing split reason proof for token.');
  }

  const splitPaymentData = new CustomSplitPaymentData(assets, SplitReason.create(burntToken, entry.proofs));

  const mintTransaction = await MintTransaction.create(
    await PayToScriptHash.create(ownerPredicate),
    tokenId,
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    await splitPaymentData.toCBOR(),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

  const response = await client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Token certification failed: ${response.status}`);
  }

  const splitToken = await Token.mint(
    trustBase,
    predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(trustBase, predicateVerifier, client, mintTransaction),
    ),
  );

  const splitResult = await TokenSplit.verify(
    await Token.fromCBOR(splitToken.toCBOR()),
    CustomSplitPaymentData.fromCBOR,
    trustBase,
    predicateVerifier,
  );

  if (splitResult.status !== VerificationStatus.OK) {
    throw new Error(`Split token verification failed: ${splitResult.status}`);
  }

  console.log(`Token[${i++}]: `, HexConverter.encode(splitToken.toCBOR()), '\n');
}
