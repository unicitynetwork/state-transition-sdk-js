import {InclusionProofVerificationStatus} from '@unicitylabs/commons/lib/api/InclusionProof.js';
import {DataHasherFactory} from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import {HashAlgorithm} from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import {NodeDataHasher} from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import {SigningService} from '@unicitylabs/commons/lib/signing/SigningService.js';

import {DirectAddress} from '../../src/address/DirectAddress.js';
import {ISerializable} from '../../src/ISerializable.js';
import {BurnPredicate} from '../../src/predicate/BurnPredicate.js';
import {MaskedPredicate} from '../../src/predicate/MaskedPredicate.js';
import {PredicateJsonFactory} from '../../src/predicate/PredicateJsonFactory.js';
import {TokenJsonDeserializer} from '../../src/serializer/token/TokenJsonDeserializer.js';
import {TransactionJsonDeserializer} from '../../src/serializer/transaction/TransactionJsonDeserializer.js';
import {StateTransitionClient} from '../../src/StateTransitionClient.js';
import {CoinId} from '../../src/token/fungible/CoinId.js';
import {TokenCoinData} from '../../src/token/fungible/TokenCoinData.js';
import {Token} from '../../src/token/Token.js';
import {TokenFactory} from '../../src/token/TokenFactory.js';
import {TokenId} from '../../src/token/TokenId.js';
import {TokenState} from '../../src/token/TokenState.js';
import {TokenType} from '../../src/token/TokenType.js';
import {MintTransactionData} from '../../src/transaction/MintTransactionData.js';
import {TokenSplitBuilder} from '../../src/transaction/TokenSplitBuilder.js';
import {ITransactionJson, Transaction} from '../../src/transaction/Transaction.js';
import {ITransactionDataJson, TransactionData} from '../../src/transaction/TransactionData.js';
import {waitInclusionProof} from '../InclusionProofUtils.js';
import {createMintData, mintToken, sendToken} from '../MintTokenUtils.js';
import {TestTokenData} from '../TestTokenData.js';
import {OfflineStateTransitionClient} from "../../src/OfflineStateTransitionClient.js";
import {DataHasher} from "@unicitylabs/commons/lib/hash/DataHasher.js";
import {OfflineCommitment} from "../../src/transaction/OfflineCommitment.js";
import {OfflineTransaction} from "../../src/transaction/OfflineTransaction.js";

const textEncoder = new TextEncoder();
const initialOwnerSecret = textEncoder.encode('secret');
const receiverSecret = textEncoder.encode('tere');
const predicateFactory = new PredicateJsonFactory();
const tokenFactory = new TokenFactory(new TokenJsonDeserializer(predicateFactory));
const transactionDeserializer = new TransactionJsonDeserializer(predicateFactory);

async function createMintToken(
  client: StateTransitionClient,
  data: MintTransactionData<ISerializable>,
  state: TokenState,
): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>> {
  const commitment = await client.submitMintTransaction(data);
  const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));
  return new Token(state, transaction);
}

function performCheckForSplitTokens(
  actualTokens: Token<Transaction<MintTransactionData<ISerializable | null>>>[],
  expectedCoinDataList: TokenCoinData[],
): void {
  expect(actualTokens.length).toEqual(expectedCoinDataList.length);

  actualTokens.forEach((actualToken, index) => {
    const expectedCoins = expectedCoinDataList[index].coins;

    const actualCoins = actualToken.coins?.coins;
    if (!actualCoins) {
      throw new Error(`actualToken at index ${index} has no coins`);
    }

    expect(actualCoins).toEqual(expectedCoins);
  });
}

export async function testTransferFlow(client: StateTransitionClient): Promise<void> {
  const data = await createMintData(
    initialOwnerSecret,
    TokenCoinData.create([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    ]),
  );
  const token = await mintToken(client, data);

  await expect(DirectAddress.create(data.predicate.reference)).resolves.toEqual(
    await DirectAddress.fromJSON(token.genesis.data.recipient),
  );

  // Recipient prepares the info for the transfer
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signingservice = await SigningService.createFromSecret(receiverSecret, nonce);
  const recipientPredicate = await MaskedPredicate.create(
    token.id,
    token.type,
    signingservice,
    HashAlgorithm.SHA256,
    nonce,
  );

  // Create transfer transaction
  const transaction = await sendToken(
    client,
    token,
    await SigningService.createFromSecret(initialOwnerSecret, data.nonce),
    await DirectAddress.create(recipientPredicate.reference),
  );

  // Recipient imports token
  const importedToken = await tokenFactory.create(token.toJSON());
  // Recipient gets transaction from sender
  const importedTransaction = await transactionDeserializer.deserialize(
    importedToken.id,
    importedToken.type,
    transaction.toJSON() as ITransactionJson<ITransactionDataJson>,
  );

  // Finish the transaction with the recipient predicate
  const updateToken = await client.finishTransaction(
    importedToken,
    await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
    importedTransaction,
  );

  const signingService = await SigningService.createFromSecret(receiverSecret, token.state.unlockPredicate.nonce);
  expect(importedToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
  expect(updateToken.id).toEqual(token.id);
  expect(updateToken.type).toEqual(token.type);
  expect(updateToken.data).toEqual(token.data);
  expect(updateToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

  // Verify the original minted token has been spent
  const senderSigningService = await SigningService.createFromSecret(initialOwnerSecret, data.nonce);
  const mintedTokenStatus = await client.getTokenStatus(token, senderSigningService.publicKey);
  expect(mintedTokenStatus).toEqual(InclusionProofVerificationStatus.OK);

  // Verify the updated token has not been spent
  const transferredTokenStatus = await client.getTokenStatus(updateToken, signingService.publicKey);
  expect(transferredTokenStatus).toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);
}

export async function testOfflineTransferFlow(client: StateTransitionClient): Promise<void> {
  let token;
  let mintDataNonce;
  let firstOwnerSigningService: SigningService;
  {
    const data = await createMintData(
        initialOwnerSecret,
        TokenCoinData.create([
          [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
          [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
        ]),
    );
    mintDataNonce = data.nonce;
    firstOwnerSigningService = await SigningService.createFromSecret(initialOwnerSecret, mintDataNonce)
    token = await mintToken(client, data);

    await expect(DirectAddress.create(data.predicate.reference)).resolves.toEqual(
        await DirectAddress.fromJSON(token.genesis.data.recipient),
    );
  }

  // Recipient prepares the info for the transfer
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const receiverSigningService = await SigningService.createFromSecret(receiverSecret, nonce);
  const recipientPredicate = await MaskedPredicate.create(
      token.id,
      token.type,
      receiverSigningService,
      HashAlgorithm.SHA256,
      nonce,
  );

  let offlineTxPackage: OfflineTransaction;
  const offlineBuilder = new OfflineStateTransitionClient(client.client)

  {
    const receivingAddress = await DirectAddress.create(recipientPredicate.reference)

    const transactionData = await TransactionData.create(
        token.state,
        receivingAddress.toJSON(),
        crypto.getRandomValues(new Uint8Array(32)),
        await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
        textEncoder.encode('my message'),
        token.nametagTokens,
    );

    // sender signs the transaction data
    const offlineCommitment: OfflineCommitment = await offlineBuilder.createOfflineCommitment(transactionData, firstOwnerSigningService);

    const offlineTxJson = new OfflineTransaction(offlineCommitment, token).toJSON();
    //...sender sends the "package" offline to the recipient
    offlineTxPackage = await OfflineTransaction.fromJSON(offlineTxJson);
  }

  // Recipient imports token (offline json file transfer)
  const importedToken = offlineTxPackage.token;
  const confirmedTx = await offlineBuilder.submitOfflineTransaction(offlineTxPackage.commitment);

  // Finish the transaction with the recipient predicate
  const updateToken = await client.finishTransaction(
    importedToken,
    await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
      confirmedTx,
  );

  const signingService = await SigningService.createFromSecret(receiverSecret, token.state.unlockPredicate.nonce);
  expect(importedToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
  expect(updateToken.id).toEqual(token.id);
  expect(updateToken.type).toEqual(token.type);
  expect(updateToken.data).toEqual(token.data);
  expect(updateToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

  // Verify the original minted token has been spent
  const senderSigningService = await SigningService.createFromSecret(initialOwnerSecret, mintDataNonce);
  const mintedTokenStatus = await client.getTokenStatus(token, senderSigningService.publicKey);
  expect(mintedTokenStatus).toEqual(InclusionProofVerificationStatus.OK);

  // Verify the updated token has not been spent
  const transferredTokenStatus = await client.getTokenStatus(updateToken, signingService.publicKey);
  expect(transferredTokenStatus).toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);
}

export async function testSplitFlow(client: StateTransitionClient): Promise<void> {
  // First, let's mint a token in the usual way.
  const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
  const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

  const coinData = TokenCoinData.create([
    [unicityToken, 10n],
    [alphaToken, 20n],
  ]);

  const mintTokenData = await createMintData(initialOwnerSecret, coinData);
  const token = await mintToken(client, mintTokenData);

  const coinsPerNewTokens = [
    TokenCoinData.create([
      [unicityToken, 10n],
      [alphaToken, 5n],
    ]),
    TokenCoinData.create([[alphaToken, 15n]]),
  ];

  const splitTokens = await splitToken(
    token,
    coinsPerNewTokens,
    initialOwnerSecret,
    mintTokenData.nonce,
    'my custom data',
    'my message',
    client,
  );

  performCheckForSplitTokens(splitTokens, coinsPerNewTokens);

  // console.log('******************************************* Split token 1 *******************************************');
  // console.log(JSON.stringify({ token: splitTokens[0], transactions: null }, null, 4));
  //
  // console.log('******************************************* Split token 2 *******************************************');
  // console.log(JSON.stringify({ token: splitTokens[1], transactions: null }, null, 4));

  const newTokenJson = JSON.stringify({ token: splitTokens[1], transactions: null });
  await tokenFactory.create(JSON.parse(newTokenJson).token);
}

export async function testSplitFlowAfterTransfer(client: StateTransitionClient): Promise<void> {
  const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
  const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

  const coinData = TokenCoinData.create([
    [unicityToken, 100n],
    [alphaToken, 100n],
  ]);

  const mintTokenData = await createMintData(initialOwnerSecret, coinData);
  const token = await mintToken(client, mintTokenData);

  // Perfrom 1st split
  const coinsPerNewTokens = [
    TokenCoinData.create([
      [unicityToken, 50n],
      [alphaToken, 50n],
    ]),
    TokenCoinData.create([
      [unicityToken, 50n],
      [alphaToken, 50n],
    ]),
  ];

  const splitTokens = await splitToken(
    token,
    coinsPerNewTokens,
    initialOwnerSecret,
    mintTokenData.nonce,
    'my custom data',
    'my message',
    client,
  );

  performCheckForSplitTokens(splitTokens, coinsPerNewTokens);

  const receiverNonce = crypto.getRandomValues(new Uint8Array(32));
  const recipientSigningService = await SigningService.createFromSecret(receiverSecret, receiverNonce);

  const reference = await MaskedPredicate.calculateReference(
    splitTokens[0].type,
    recipientSigningService.algorithm,
    recipientSigningService.publicKey,
    HashAlgorithm.SHA256,
    receiverNonce,
  );
  const recipientAddress = await DirectAddress.create(reference);

  // Create transfer transaction
  const sendTokenTx = await sendToken(
    client,
    splitTokens[0],
    await SigningService.createFromSecret(initialOwnerSecret, splitTokens[0].state.unlockPredicate.nonce),
    recipientAddress,
  );

  //sender export token with transfer transaction
  const tokenJson = JSON.stringify({ token: splitTokens[0], transaction: sendTokenTx });

  // Recipient imports token and transaction
  const receiverImportedToken = await tokenFactory.create(JSON.parse(tokenJson).token);

  const importedTransaction = await transactionDeserializer.deserialize(
    receiverImportedToken.id,
    receiverImportedToken.type,
    JSON.parse(tokenJson).transaction as ITransactionJson<ITransactionDataJson>,
  );

  const maskedPredicate = await MaskedPredicate.create(
    receiverImportedToken.id,
    receiverImportedToken.type,
    recipientSigningService,
    HashAlgorithm.SHA256,
    receiverNonce,
  );

  // Finish the transaction with the recipient predicate
  const updateToken = await client.finishTransaction(
    receiverImportedToken,
    await TokenState.create(maskedPredicate, textEncoder.encode('my custom data')),
    importedTransaction,
  );

  expect(receiverImportedToken.state.unlockPredicate.isOwner(recipientSigningService.publicKey)).toBeTruthy();
  expect(updateToken.id).toEqual(splitTokens[0].id);
  expect(updateToken.type).toEqual(splitTokens[0].type);
  expect(updateToken.data).toEqual(splitTokens[0].data);
  expect(updateToken.coins?.toJSON()).toEqual(splitTokens[0].coins?.toJSON());

  // Now let's split that received token into 2 tokens.
  const coinsPerNewTokens2 = [
    TokenCoinData.create([
      [unicityToken, 26n],
      [alphaToken, 27n],
    ]),
    TokenCoinData.create([
      [unicityToken, 24n],
      [alphaToken, 23n],
    ]),
  ];

  const splitTokens2 = await splitToken(
    updateToken,
    coinsPerNewTokens2,
    receiverSecret,
    receiverNonce,
    'my custom data',
    'my custom message',
    client,
  );

  performCheckForSplitTokens(splitTokens2, coinsPerNewTokens2);
}

async function splitToken(
  token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
  coinsPerNewTokens: TokenCoinData[],
  ownerSecret: Uint8Array,
  nonce: Uint8Array,
  customDataString: string,
  customMessage: string,
  client: StateTransitionClient,
): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>[]> {
  const builder = new TokenSplitBuilder();
  const predicates = new Map<bigint, MaskedPredicate>();
  for (const coins of coinsPerNewTokens) {
    const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
    const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signingService = await SigningService.createFromSecret(ownerSecret, nonce);

    const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);
    predicates.set(tokenId.toBigInt(), predicate);

    const token = builder.createToken(
      tokenId,
      tokenType,
      new Uint8Array(),
      (await DirectAddress.create(predicate.reference)).toString(),
      await new NodeDataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(customDataString)).digest(),
      crypto.getRandomValues(new Uint8Array(32)),
    );

    for (const [id, amount] of coins.coins.entries()) {
      token.addCoin(id, amount);
    }
  }

  const splitData = await builder.build(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));

  const burnPredicate = await BurnPredicate.create(
    token.id,
    token.type,
    crypto.getRandomValues(new Uint8Array(32)),
    splitData.rootHash,
  );
  const commitment = await client.submitTransaction(
    await TransactionData.create(
      token.state,
      (await DirectAddress.create(burnPredicate.reference)).toString(),
      crypto.getRandomValues(new Uint8Array(32)),
      await new NodeDataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(customDataString)).digest(),
      textEncoder.encode(customMessage),
    ),
    await SigningService.createFromSecret(ownerSecret, nonce),
  );
  const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

  const updatedToken = await client.finishTransaction(
    token,
    await TokenState.create(burnPredicate, textEncoder.encode(customDataString)),
    transaction,
  );

  const mintTransactions = await splitData.toMintTransactionDataList(updatedToken);
  return Promise.all(
    mintTransactions.map((data) =>
      TokenState.create(predicates.get(data.tokenId.toBigInt())!, textEncoder.encode(customDataString)).then((state) =>
        createMintToken(client, data, state),
      ),
    ),
  );
}
