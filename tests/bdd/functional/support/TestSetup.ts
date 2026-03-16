import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { AggregatorClient } from '../../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../../../src/api/IAggregatorClient.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { IPaymentData } from '../../../../src/payment/IPaymentData.js';
import { ISplitPaymentData } from '../../../../src/payment/ISplitPaymentData.js';
import { SplitReason } from '../../../../src/payment/SplitReason.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { PayToPublicKeyPredicate } from '../../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { IPredicate } from '../../../../src/predicate/IPredicate.js';
import { PredicateVerifier } from '../../../../src/predicate/verification/PredicateVerifier.js';
import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../../../src/transaction/PayToScriptHash.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { ShardAwareAggregatorClient } from './ShardAwareAggregatorClient.js';

export interface ITestSetup {
  readonly aggregatorClient: IAggregatorClient;
  readonly client: StateTransitionClient;
  readonly predicateVerifier: PredicateVerifier;
  readonly trustBase: RootTrustBase;
}

export interface IUser {
  readonly predicate: PayToPublicKeyPredicate;
  readonly signingService: SigningService;
}

export function createTestSetup(): ITestSetup {
  const aggregatorClient = createAggregatorClient();
  const client = new StateTransitionClient(aggregatorClient);
  const predicateVerifier = PredicateVerifier.create();
  const trustBasePath = process.env.TRUST_BASE_PATH
    ?? fileURLToPath(new URL('../../../../tests/functional/trust-base.json', import.meta.url));
  const trustBaseJsonString = readFileSync(trustBasePath, 'utf-8');
  const trustBase = RootTrustBase.fromJSON(JSON.parse(trustBaseJsonString));

  return { aggregatorClient, client, predicateVerifier, trustBase };
}

function createAggregatorClient(): IAggregatorClient {
  const apiKey = process.env.AGGREGATOR_API_KEY ?? null;

  if (process.env.SHARD_2_URL) {
    const shardIdLength = parseInt(process.env.SHARD_ID_LENGTH ?? '1', 10);
    const baseId = 1 << shardIdLength;
    const expectedCount = 1 << shardIdLength;
    const shardMap = new Map<number, AggregatorClient>();

    for (let i = 0; i < expectedCount; i++) {
      const shardId = baseId + i;
      const url = process.env[`SHARD_${shardId}_URL`];
      if (!url) {
        throw new Error(
          `Missing SHARD_${shardId}_URL env var. Expected all shard IDs from ${baseId} to ${baseId + expectedCount - 1}`,
        );
      }
      shardMap.set(shardId, new AggregatorClient(url, apiKey));
    }

    console.log(`[TestSetup] Shard mode: shardIdLength=${shardIdLength}, shards=${[...shardMap.keys()].join(',')}`);
    return new ShardAwareAggregatorClient(shardIdLength, shardMap);
  }

  const url = process.env.AGGREGATOR_URL ?? 'http://192.168.43.106:3000';
  console.log(`[TestSetup] Single aggregator mode: ${url}`);
  return new AggregatorClient(url, apiKey);
}

export function createUser(): IUser {
  const signingService = new SigningService(SigningService.generatePrivateKey());
  const predicate = PayToPublicKeyPredicate.create(signingService);
  return { predicate, signingService };
}

export async function mintToken(setup: ITestSetup, user: IUser): Promise<Token> {
  const mintTransaction = await MintTransaction.create(
    await PayToScriptHash.create(user.predicate),
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  const response = await setup.client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Mint certification failed: ${response.status}`);
  }

  return Token.mint(
    setup.trustBase,
    setup.predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, mintTransaction),
    ),
  );
}

export async function mintTokenWithAssets(
  setup: ITestSetup,
  user: IUser,
  assets: PaymentAssetCollection,
): Promise<Token> {
  const mintTransaction = await MintTransaction.create(
    await PayToScriptHash.create(user.predicate),
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    assets.toCBOR(),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  const response = await setup.client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Mint certification failed: ${response.status}`);
  }

  return Token.mint(
    setup.trustBase,
    setup.predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, mintTransaction),
    ),
  );
}

export async function transferToken(
  setup: ITestSetup,
  token: Token,
  ownerPredicate: IPredicate,
  ownerSigningService: SigningService,
  recipientPredicate: IPredicate,
): Promise<Token> {
  const transferTransaction = await TransferTransaction.create(
    token,
    ownerPredicate,
    await PayToScriptHash.create(recipientPredicate),
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromTransferTransaction(
    transferTransaction,
    await PayToPublicKeyPredicate.generateUnlockScript(transferTransaction, ownerSigningService),
  );

  const response = await setup.client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Transfer certification failed: ${response.status}`);
  }

  return token.transfer(
    setup.trustBase,
    setup.predicateVerifier,
    await transferTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, transferTransaction),
    ),
  );
}

export async function splitToken(
  setup: ITestSetup,
  token: Token,
  ownerPredicate: IPredicate,
  ownerSigningService: SigningService,
  splitTokenAssets: [TokenId, PaymentAssetCollection][],
  parsePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
): Promise<{ burnedToken: Token; splitTokens: Token[] }> {
  const splitResult = await TokenSplit.split(token, ownerPredicate, parsePaymentData, splitTokenAssets);

  // Submit burn transaction
  const burnCertificationData = await CertificationData.fromTransferTransaction(
    splitResult.burn.transaction,
    await PayToPublicKeyPredicate.generateUnlockScript(splitResult.burn.transaction, ownerSigningService),
  );

  const burnResponse = await setup.client.submitCertificationRequest(burnCertificationData);
  if (burnResponse.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Burn certification failed: ${burnResponse.status}`);
  }

  const burnedToken = await token.transfer(
    setup.trustBase,
    setup.predicateVerifier,
    await splitResult.burn.transaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, splitResult.burn.transaction),
    ),
  );

  // Mint split tokens
  const splitTokens: Token[] = [];
  for (const [tokenId, assets] of splitTokenAssets) {
    const proofEntry = splitResult.proofs.get(tokenId);
    if (!proofEntry) {
      throw new Error(`Proofs not found for token ${tokenId.toString()}`);
    }

    const reason = SplitReason.create(burnedToken, proofEntry.proofs);
    const splitPaymentData = CborSerializer.encodeArray(assets.toCBOR(), reason.toCBOR());

    const splitUser = createUser();
    const mintTransaction = await MintTransaction.create(
      await PayToScriptHash.create(splitUser.predicate),
      tokenId,
      token.type,
      splitPaymentData,
    );

    const certData = await CertificationData.fromMintTransaction(mintTransaction);
    const resp = await setup.client.submitCertificationRequest(certData);
    if (resp.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Split mint certification failed: ${resp.status}`);
    }

    const newSplitToken = await Token.mint(
      setup.trustBase,
      setup.predicateVerifier,
      await mintTransaction.toCertifiedTransaction(
        setup.trustBase,
        setup.predicateVerifier,
        await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, mintTransaction),
      ),
    );

    splitTokens.push(newSplitToken);
  }

  return { burnedToken, splitTokens };
}

export function createAssetId(): AssetId {
  return new AssetId(crypto.getRandomValues(new Uint8Array(32)));
}

export function createAsset(id: AssetId, value: bigint): Asset {
  return new Asset(id, value);
}

export function createPaymentAssets(...assets: Asset[]): PaymentAssetCollection {
  return PaymentAssetCollection.create(...assets);
}

export function parseSimplePaymentData(bytes: Uint8Array): Promise<IPaymentData> {
  const assets = PaymentAssetCollection.fromCBOR(bytes);
  return Promise.resolve({
    assets,
    toCBOR: (): Promise<Uint8Array> => Promise.resolve(assets.toCBOR()),
  });
}

export function parseSplitPaymentData(bytes: Uint8Array): Promise<IPaymentData> {
  const data = CborDeserializer.decodeArray(bytes);
  const assets = PaymentAssetCollection.fromCBOR(data[0]);
  return Promise.resolve({
    assets,
    toCBOR: (): Promise<Uint8Array> => Promise.resolve(bytes),
  });
}

export async function parseSplitVerificationData(bytes: Uint8Array): Promise<ISplitPaymentData> {
  const data = CborDeserializer.decodeArray(bytes);
  const assets = PaymentAssetCollection.fromCBOR(data[0]);
  const reason = await SplitReason.fromCBOR(data[1]);
  return { assets, reason, toCBOR: (): Promise<Uint8Array> => Promise.resolve(bytes) };
}

export async function splitTokenToOwner(
  setup: ITestSetup,
  token: Token,
  ownerPredicate: IPredicate,
  ownerSigningService: SigningService,
  splitTokenAssets: [TokenId, PaymentAssetCollection][],
  parsePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
  mintTo: IUser,
): Promise<{ burnedToken: Token; splitTokens: Token[] }> {
  const splitResult = await TokenSplit.split(token, ownerPredicate, parsePaymentData, splitTokenAssets);

  // Submit burn transaction
  const burnCertificationData = await CertificationData.fromTransferTransaction(
    splitResult.burn.transaction,
    await PayToPublicKeyPredicate.generateUnlockScript(splitResult.burn.transaction, ownerSigningService),
  );

  const burnResponse = await setup.client.submitCertificationRequest(burnCertificationData);
  if (burnResponse.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Burn certification failed: ${burnResponse.status}`);
  }

  const burnedToken = await token.transfer(
    setup.trustBase,
    setup.predicateVerifier,
    await splitResult.burn.transaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, splitResult.burn.transaction),
    ),
  );

  // Mint split tokens to the specified owner
  const splitTokens: Token[] = [];
  for (const [tokenId, assets] of splitTokenAssets) {
    const proofEntry = splitResult.proofs.get(tokenId);
    if (!proofEntry) {
      throw new Error(`Proofs not found for token ${tokenId.toString()}`);
    }

    const reason = SplitReason.create(burnedToken, proofEntry.proofs);
    const splitPaymentDataBytes = CborSerializer.encodeArray(assets.toCBOR(), reason.toCBOR());

    const mintTransaction = await MintTransaction.create(
      await PayToScriptHash.create(mintTo.predicate),
      tokenId,
      token.type,
      splitPaymentDataBytes,
    );

    const certData = await CertificationData.fromMintTransaction(mintTransaction);
    const resp = await setup.client.submitCertificationRequest(certData);
    if (resp.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Split mint certification failed: ${resp.status}`);
    }

    const newSplitToken = await Token.mint(
      setup.trustBase,
      setup.predicateVerifier,
      await mintTransaction.toCertifiedTransaction(
        setup.trustBase,
        setup.predicateVerifier,
        await waitInclusionProof(setup.trustBase, setup.predicateVerifier, setup.client, mintTransaction),
      ),
    );

    splitTokens.push(newSplitToken);
  }

  return { burnedToken, splitTokens };
}
