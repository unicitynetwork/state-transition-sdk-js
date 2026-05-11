import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { ShardAwareAggregatorClient } from './ShardAwareAggregatorClient.js';
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
import { SplitMintJustification } from '../../../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../../../src/payment/SplitMintJustificationVerifier.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { IPredicate } from '../../../../src/predicate/IPredicate.js';
import { PredicateVerifierService } from '../../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { MintJustificationVerifierService } from '../../../../src/transaction/verification/MintJustificationVerifierService.js';
import { UnicityId } from '../../../../src/unicity-id/UnicityId.js';
import { UnicityIdMintTransaction } from '../../../../src/unicity-id/UnicityIdMintTransaction.js';
import { UnicityIdToken } from '../../../../src/unicity-id/UnicityIdToken.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

export interface ITestSetup {
  readonly aggregatorClient: IAggregatorClient;
  readonly client: StateTransitionClient;
  readonly mintJustificationVerifier: MintJustificationVerifierService;
  readonly predicateVerifier: PredicateVerifierService;
  readonly trustBase: RootTrustBase;
}

export interface IUser {
  readonly predicate: SignaturePredicate;
  readonly signingService: SigningService;
}

export function createTestSetup(): ITestSetup {
  const aggregatorClient = withTransportRetry(createAggregatorClient());
  const client = new StateTransitionClient(aggregatorClient);
  const trustBasePath =
    process.env.TRUST_BASE_PATH ??
    fileURLToPath(new URL('../../../../tests/functional/trust-base.json', import.meta.url));
  const trustBaseJsonString = readFileSync(trustBasePath, 'utf-8');
  const trustBase = RootTrustBase.fromJSON(JSON.parse(trustBaseJsonString));
  const predicateVerifier = PredicateVerifierService.create();
  const mintJustificationVerifier = new MintJustificationVerifierService().register(
    new SplitMintJustificationVerifier(trustBase, predicateVerifier, parseSplitVerificationData),
  );

  return { aggregatorClient, client, mintJustificationVerifier, predicateVerifier, trustBase };
}

function createAggregatorClient(): IAggregatorClient {
  const apiKey = process.env.AGGREGATOR_API_KEY ?? null;
  const shardIdLength = parseInt(process.env.SHARD_ID_LENGTH ?? '1', 10);
  const routingMode = (process.env.SHARD_ROUTING_MODE ?? 'lsb').toLowerCase() as 'lsb' | 'msb';
  if (routingMode !== 'lsb' && routingMode !== 'msb') {
    throw new Error(`Invalid SHARD_ROUTING_MODE='${process.env.SHARD_ROUTING_MODE}'. Expected 'lsb' or 'msb'.`);
  }
  const firstShardId = 1 << shardIdLength;

  if (process.env[`SHARD_${firstShardId}_URL`]) {
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

    console.log(
      `[TestSetup] Shard mode: shardIdLength=${shardIdLength}, routing=${routingMode}, shards=${[...shardMap.keys()].join(',')}`,
    );
    return new ShardAwareAggregatorClient(shardIdLength, shardMap, routingMode);
  }

  const url = process.env.AGGREGATOR_URL ?? 'http://localhost:3000';
  console.log(`[TestSetup] Single aggregator mode: ${url}`);
  return new AggregatorClient(url, apiKey);
}

// --- transport-level retry ---------------------------------------------------
// A shared aggregator proxy choking under concurrent BDD load tends to drop
// connections, surfacing as `TypeError: fetch failed` (undici) deep inside
// submitCertificationRequest / getInclusionProof. Those are transport faults,
// not protocol outcomes (STATE_ID_EXISTS, SIGNATURE_VERIFICATION_FAILED, …),
// so they are safe to retry. Protocol responses pass straight through.
// Tune with AGGREGATOR_RETRY_ATTEMPTS / AGGREGATOR_RETRY_DELAY_MS.

const TRANSPORT_RETRY_ATTEMPTS = parseInt(process.env.AGGREGATOR_RETRY_ATTEMPTS ?? '5', 10);
const TRANSPORT_RETRY_BASE_DELAY_MS = parseInt(process.env.AGGREGATOR_RETRY_DELAY_MS ?? '300', 10);
const TRANSPORT_ERROR_NEEDLES = [
  'fetch failed',
  'socket hang up',
  'other side closed',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
];

function isTransportError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as { code?: unknown }).code;
    const haystack = `${current.name} ${current.message} ${typeof code === 'string' ? code : ''}`;
    if (TRANSPORT_ERROR_NEEDLES.some((needle) => haystack.includes(needle))) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTransportRetry(target: IAggregatorClient): IAggregatorClient {
  return new Proxy(target, {
    get(obj: IAggregatorClient, prop: string | symbol, receiver: unknown): unknown {
      const member: unknown = Reflect.get(obj, prop, receiver);
      if (typeof member !== 'function') {
        return member;
      }
      const original = member as (...args: unknown[]) => unknown;
      return async function retrying(...args: unknown[]): Promise<unknown> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= TRANSPORT_RETRY_ATTEMPTS; attempt++) {
          try {
            return await original.apply(obj, args);
          } catch (error) {
            lastError = error;
            if (!isTransportError(error) || attempt === TRANSPORT_RETRY_ATTEMPTS) {
              throw error;
            }
            await sleep(TRANSPORT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          }
        }
        throw lastError;
      };
    },
  });
}

export function createUser(): IUser {
  const signingService = new SigningService(SigningService.generatePrivateKey());
  const predicate = SignaturePredicate.fromSigningService(signingService);
  return { predicate, signingService };
}

export function mintToken(setup: ITestSetup, user: IUser): Promise<Token> {
  return mintTokenToRecipient(setup, user.predicate);
}

/**
 * Mint a fresh token locked to an arbitrary recipient predicate (e.g. a UnicityIdPredicate),
 * not just a SignaturePredicate. Used by the unicity-id-predicate-verifier coverage.
 */
export async function mintTokenToRecipient(setup: ITestSetup, recipient: IPredicate): Promise<Token> {
  const mintTransaction = await MintTransaction.create(recipient, TokenId.generate(), TokenType.generate());

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  const response = await setup.client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Mint certification failed: ${response.status}`);
  }

  return Token.mint(
    setup.trustBase,
    setup.predicateVerifier,
    setup.mintJustificationVerifier,
    await mintTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, mintTransaction),
    ),
  );
}

export async function mintTokenWithAssets(
  setup: ITestSetup,
  user: IUser,
  assets: PaymentAssetCollection,
): Promise<Token> {
  const mintTransaction = await MintTransaction.create(
    user.predicate,
    TokenId.generate(),
    TokenType.generate(),
    null,
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
    setup.mintJustificationVerifier,
    await mintTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, mintTransaction),
    ),
  );
}

export async function transferToken(
  setup: ITestSetup,
  token: Token,
  _ownerPredicate: IPredicate,
  ownerSigningService: SigningService,
  recipientPredicate: IPredicate,
): Promise<Token> {
  const transferTransaction = await TransferTransaction.create(
    token,
    recipientPredicate,
    crypto.getRandomValues(new Uint8Array(32)),
  );

  const certificationData = await CertificationData.fromTransaction(
    transferTransaction,
    await SignaturePredicateUnlockScript.create(transferTransaction, ownerSigningService),
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
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, transferTransaction),
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
  const splitResult = await TokenSplit.split(token, parsePaymentData, splitTokenAssets);

  // Submit burn transaction
  const burnCertificationData = await CertificationData.fromTransaction(
    splitResult.burn.transaction,
    await SignaturePredicateUnlockScript.create(splitResult.burn.transaction, ownerSigningService),
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
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, splitResult.burn.transaction),
    ),
  );

  // Mint split tokens
  const splitTokens: Token[] = [];
  for (const [tokenId, assets] of splitTokenAssets) {
    const proofEntry = splitResult.proofs.get(tokenId);
    if (!proofEntry) {
      throw new Error(`Proofs not found for token ${tokenId.toString()}`);
    }

    const justification = SplitMintJustification.create(burnedToken, proofEntry.proofs);
    const splitUser = createUser();
    const mintTransaction = await MintTransaction.create(
      splitUser.predicate,
      tokenId,
      token.type,
      justification.toCBOR(),
      assets.toCBOR(),
    );

    const certData = await CertificationData.fromMintTransaction(mintTransaction);
    const resp = await setup.client.submitCertificationRequest(certData);
    if (resp.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Split mint certification failed: ${resp.status}`);
    }

    const newSplitToken = await Token.mint(
      setup.trustBase,
      setup.predicateVerifier,
      setup.mintJustificationVerifier,
      await mintTransaction.toCertifiedTransaction(
        setup.trustBase,
        setup.predicateVerifier,
        await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, mintTransaction),
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
    encode: (): Promise<Uint8Array> => Promise.resolve(assets.toCBOR()),
  });
}

export function parseSplitPaymentData(bytes: Uint8Array): Promise<IPaymentData> {
  return parseSimplePaymentData(bytes);
}

export function parseSplitVerificationData(bytes: Uint8Array): Promise<IPaymentData> {
  const assets = PaymentAssetCollection.fromCBOR(bytes);
  return Promise.resolve({
    assets,
    encode: (): Promise<Uint8Array> => Promise.resolve(bytes),
  });
}

/**
 * Post-PR #112 negative-path helper.
 *
 * Why: TransferTransaction.create no longer enforces ownership; rejection moved to the
 * predicate-verifier layer. Tests that previously asserted .create() throws now build the
 * transaction, sign with the attacker's key, and verify against the token's lockScript —
 * expecting either VerificationStatus.FAIL (wrong-signer for PayToPublicKey) or a thrown
 * error (e.g. BurnPredicate has no registered verifier).
 */
export async function attemptUnauthorizedTransfer(
  setup: ITestSetup,
  token: Token,
  attacker: IUser,
  recipient: IPredicate,
): Promise<Error | null> {
  try {
    const tx = await TransferTransaction.create(token, recipient, crypto.getRandomValues(new Uint8Array(32)));
    const unlock = await SignaturePredicateUnlockScript.create(tx, attacker.signingService);
    const result = await setup.predicateVerifier.verify(
      token.latestTransaction.recipient,
      tx.sourceStateHash,
      await tx.calculateTransactionHash(),
      unlock.encode(),
    );
    return result.status === VerificationStatus.OK
      ? null
      : new Error(`Predicate verification rejected: ${result.message ?? result.status}`);
  } catch (e) {
    return e as Error;
  }
}

/**
 * Post-PR #112 negative-path helper for splits.
 *
 * Why: TokenSplit.split no longer enforces ownership — it builds a burn TransferTransaction
 * internally and returns it. Rejection moves to the predicate-verifier layer when the burn
 * is signed and submitted. This helper attempts the burn signature with the attacker's key
 * and verifies against the token's current lockScript.
 */
export async function attemptUnauthorizedSplit(
  setup: ITestSetup,
  token: Token,
  attacker: IUser,
  decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
  splitAssets: [TokenId, PaymentAssetCollection][],
): Promise<Error | null> {
  try {
    const { burn } = await TokenSplit.split(token, decodePaymentData, splitAssets);
    const unlock = await SignaturePredicateUnlockScript.create(burn.transaction, attacker.signingService);
    const result = await setup.predicateVerifier.verify(
      token.latestTransaction.recipient,
      burn.transaction.sourceStateHash,
      await burn.transaction.calculateTransactionHash(),
      unlock.encode(),
    );
    return result.status === VerificationStatus.OK
      ? null
      : new Error(`Predicate verification rejected split burn: ${result.message ?? result.status}`);
  } catch (e) {
    return e as Error;
  }
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
  const splitResult = await TokenSplit.split(token, parsePaymentData, splitTokenAssets);

  // Submit burn transaction
  const burnCertificationData = await CertificationData.fromTransaction(
    splitResult.burn.transaction,
    await SignaturePredicateUnlockScript.create(splitResult.burn.transaction, ownerSigningService),
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
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, splitResult.burn.transaction),
    ),
  );

  // Mint split tokens to the specified owner
  const splitTokens: Token[] = [];
  for (const [tokenId, assets] of splitTokenAssets) {
    const proofEntry = splitResult.proofs.get(tokenId);
    if (!proofEntry) {
      throw new Error(`Proofs not found for token ${tokenId.toString()}`);
    }

    const justification = SplitMintJustification.create(burnedToken, proofEntry.proofs);
    const mintTransaction = await MintTransaction.create(
      mintTo.predicate,
      tokenId,
      token.type,
      justification.toCBOR(),
      assets.toCBOR(),
    );

    const certData = await CertificationData.fromMintTransaction(mintTransaction);
    const resp = await setup.client.submitCertificationRequest(certData);
    if (resp.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Split mint certification failed: ${resp.status}`);
    }

    const newSplitToken = await Token.mint(
      setup.trustBase,
      setup.predicateVerifier,
      setup.mintJustificationVerifier,
      await mintTransaction.toCertifiedTransaction(
        setup.trustBase,
        setup.predicateVerifier,
        await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, mintTransaction),
      ),
    );

    splitTokens.push(newSplitToken);
  }

  return { burnedToken, splitTokens };
}

// -----------------------------------------------------------------------------
// Nametag / addressing helpers
// -----------------------------------------------------------------------------

export type AddressingMethod = 'pubkey' | 'nametag';

export async function registerNametag(
  setup: ITestSetup,
  user: IUser,
  name: string,
  domain: string | null = 'bdd/test',
): Promise<UnicityIdToken> {
  const nametagSigningService = new SigningService(SigningService.generatePrivateKey());
  const unicityId = new UnicityId(name, domain);

  const mintTransaction = await UnicityIdMintTransaction.create(
    SignaturePredicate.fromSigningService(nametagSigningService),
    user.predicate,
    unicityId,
    TokenType.generate(),
    user.predicate,
  );

  const certificationData = await CertificationData.fromTransaction(
    mintTransaction,
    await SignaturePredicateUnlockScript.create(mintTransaction, nametagSigningService),
  );

  const response = await setup.client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Nametag registration failed: ${response.status}`);
  }

  return UnicityIdToken.mint(
    setup.trustBase,
    setup.predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, mintTransaction),
    ),
  );
}

export function resolveNametag(nametagToken: UnicityIdToken): IPredicate {
  return nametagToken.genesis.targetPredicate;
}

export function resolveRecipientPredicate(
  recipient: IUser,
  method: AddressingMethod,
  nametagToken: UnicityIdToken | null = null,
): IPredicate {
  if (method === 'pubkey') {
    return recipient.predicate;
  }
  if (method === 'nametag') {
    if (!nametagToken) {
      throw new Error('addressing via "nametag" requires a registered nametag token');
    }
    return resolveNametag(nametagToken);
  }
  throw new Error(`Unsupported addressing method: ${method as string}`);
}

export interface IHop {
  readonly from: IUser;
  readonly method: AddressingMethod;
  readonly to: IUser;
}

export async function runMixedChain(
  setup: ITestSetup,
  hops: IHop[],
  nametagRegistry: Map<IUser, UnicityIdToken>,
): Promise<{ finalToken: Token; tokens: Token[] }> {
  if (hops.length === 0) {
    throw new Error('runMixedChain requires at least one hop');
  }

  const firstHop = hops[0];
  const firstRecipient = resolveRecipientPredicate(
    firstHop.to,
    firstHop.method,
    firstHop.method === 'nametag' ? (nametagRegistry.get(firstHop.to) ?? null) : null,
  );

  const mintTransaction = await MintTransaction.create(firstRecipient, TokenId.generate(), TokenType.generate());
  const mintCert = await CertificationData.fromMintTransaction(mintTransaction);
  const mintResponse = await setup.client.submitCertificationRequest(mintCert);
  if (mintResponse.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Mint certification failed: ${mintResponse.status}`);
  }

  let currentToken = await Token.mint(
    setup.trustBase,
    setup.predicateVerifier,
    setup.mintJustificationVerifier,
    await mintTransaction.toCertifiedTransaction(
      setup.trustBase,
      setup.predicateVerifier,
      await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, mintTransaction),
    ),
  );

  const tokens: Token[] = [currentToken];
  let currentOwner = firstHop.to;

  for (let i = 1; i < hops.length; i++) {
    const hop = hops[i];
    if (hop.from !== currentOwner) {
      throw new Error(`Hop ${i} must start from previous recipient`);
    }

    const recipientPredicate = resolveRecipientPredicate(
      hop.to,
      hop.method,
      hop.method === 'nametag' ? (nametagRegistry.get(hop.to) ?? null) : null,
    );

    const transferTransaction = await TransferTransaction.create(
      currentToken,
      recipientPredicate,
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const transferCert = await CertificationData.fromTransaction(
      transferTransaction,
      await SignaturePredicateUnlockScript.create(transferTransaction, hop.from.signingService),
    );

    const transferResponse = await setup.client.submitCertificationRequest(transferCert);
    if (transferResponse.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Transfer certification at hop ${i} failed: ${transferResponse.status}`);
    }

    currentToken = await currentToken.transfer(
      setup.trustBase,
      setup.predicateVerifier,
      await transferTransaction.toCertifiedTransaction(
        setup.trustBase,
        setup.predicateVerifier,
        await waitInclusionProof(setup.client, setup.trustBase, setup.predicateVerifier, transferTransaction),
      ),
    );
    tokens.push(currentToken);
    currentOwner = hop.to;
  }

  return { finalToken: currentToken, tokens };
}
