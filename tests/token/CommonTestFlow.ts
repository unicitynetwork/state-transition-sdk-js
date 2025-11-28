import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { RootTrustBase } from '../../src/bft/RootTrustBase.js';
import { DataHasher } from '../../src/hash/DataHasher.js';
import { HashAlgorithm } from '../../src/hash/HashAlgorithm.js';
import { MaskedPredicate } from '../../src/predicate/embedded/MaskedPredicate.js';
import { MaskedPredicateReference } from '../../src/predicate/embedded/MaskedPredicateReference.js';
import { UnmaskedPredicate } from '../../src/predicate/embedded/UnmaskedPredicate.js';
import { UnmaskedPredicateReference } from '../../src/predicate/embedded/UnmaskedPredicateReference.js';
import { PredicateEngineService } from '../../src/predicate/PredicateEngineService.js';
import { SigningService } from '../../src/sign/SigningService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { CoinId } from '../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../src/token/fungible/TokenCoinData.js';
import { Token } from '../../src/token/Token.js';
import { TokenId } from '../../src/token/TokenId.js';
import { TokenState } from '../../src/token/TokenState.js';
import { TokenType } from '../../src/token/TokenType.js';
import { DefaultMintReasonFactory } from '../../src/transaction/DefaultMintReasonFactory.js';
import { TokenSplitBuilder } from '../../src/transaction/split/TokenSplitBuilder.js';
import { TransferCommitment } from '../../src/transaction/TransferCommitment.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { createMintData, mintToken, sendToken } from '../MintTokenUtils.js';
import { TestEmptyMintReason } from '../TestEmptyMintReason.js';

const textEncoder = new TextEncoder();
const aliceSecret = textEncoder.encode('Alice');
const bobSecret = textEncoder.encode('Bob');

function performCheckForSplitTokens(actualTokens: Token[], expectedCoinDataList: TokenCoinData[]): void {
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

export async function testTransferFlow(trustBase: RootTrustBase, client: StateTransitionClient): Promise<void> {
  const mintReasonFactory = new DefaultMintReasonFactory([TestEmptyMintReason]);

  // Alice
  const mintData = createMintData(
    TokenCoinData.create([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    ]),
  );

  const aliceToken = await mintToken(
    aliceSecret,
    trustBase,
    mintReasonFactory,
    client,
    mintData,
    new TestEmptyMintReason(),
  );
  await expect(client.isMinted(trustBase, aliceToken.id)).resolves.toBeTruthy();
  await expect(
    client.isTokenStateSpent(
      trustBase,
      aliceToken,
      await SigningService.createFromSecret(aliceSecret, mintData.nonce).then(
        (signingService) => signingService.publicKey,
      ),
    ),
  ).resolves.toBeFalsy();

  // Recipient (Bob) prepares the info for the transfer: new state and address
  const bobTokenState = "Bob's custom data"; // Bob gives this custom data to the Alice to use in the transfer
  const bobNonce = crypto.getRandomValues(new Uint8Array(32));
  const bobSigningService = await SigningService.createFromSecret(bobSecret, bobNonce);
  const bobPredicate = MaskedPredicate.createFromToken(aliceToken, bobSigningService, HashAlgorithm.SHA256, bobNonce);

  const bobAddress = await bobPredicate.getReference().then((reference) => reference.toAddress());

  // IRL Bob should send Alice the state hash (sha256('bobTokenState')) to use in the transfer.
  // Alice creates transfer transaction using Bob's address and new token state and sends commitment to the aggregator.
  const transaction = await sendToken(
    trustBase,
    client,
    aliceToken,
    await SigningService.createFromSecret(aliceSecret, mintData.nonce),
    bobAddress,
    bobTokenState,
  );

  // Bob imports token+transaction
  const importedToken = await Token.fromJSON(aliceToken.toJSON());
  // Recipient gets transaction from sender
  const importedTransaction = await TransferTransaction.fromJSON(transaction.toJSON());

  // Finish the transaction with the Bob's predicate
  const bobToken = await client.finalizeTransaction(
    trustBase,
    mintReasonFactory,
    importedToken,
    new TokenState(bobPredicate, textEncoder.encode(bobTokenState)),
    importedTransaction,
  );

  await expect(
    bobToken.verify(trustBase, mintReasonFactory).then((result) => result.isSuccessful),
  ).resolves.toBeTruthy();
  expect(bobToken.id).toEqual(aliceToken.id);
  expect(bobToken.type).toEqual(aliceToken.type);
  expect(bobToken.data).toEqual(aliceToken.data);
  expect(bobToken.coins?.toJSON()).toEqual(aliceToken.coins?.toJSON());

  // Verify the original minted token has been spent
  const senderSigningService = await SigningService.createFromSecret(aliceSecret, mintData.nonce);
  await expect(client.isTokenStateSpent(trustBase, aliceToken, senderSigningService.publicKey)).resolves.toBeTruthy();

  // Verify the updated token has not been spent
  await expect(client.isTokenStateSpent(trustBase, bobToken, bobSigningService.publicKey)).resolves.toBeFalsy();

  // Transfer to the third owner (Carol) with UnmaskedPredicate
  const carolSecret = textEncoder.encode('Carol');
  const carolNonce = crypto.getRandomValues(new Uint8Array(32));
  const carolSigningService = await SigningService.createFromSecret(carolSecret, carolNonce);
  const carolRef = await UnmaskedPredicateReference.createFromSigningService(
    bobToken.type,
    carolSigningService,
    HashAlgorithm.SHA256,
  );
  const carolAddress = await carolRef.toAddress();

  // Create transfer transaction Bob -> Carol
  const txToCarol = await sendToken(
    trustBase,
    client,
    bobToken,
    bobSigningService,
    carolAddress,
    null, // NB! Carol has to provide Bob the token state hash. If she doesn't, Bob uses 'null'.
  );

  // Carol imports token
  const carolToken = await Token.fromJSON(bobToken.toJSON());
  await expect(
    carolToken.verify(trustBase, mintReasonFactory).then((result) => result.isSuccessful),
  ).resolves.toBeTruthy();

  // Carol gets transaction from Bob
  const carolTransaction = await TransferTransaction.fromJSON(txToCarol.toJSON());

  // now Carol can create an UnmaskedPredicate knowing token information
  const carolPredicate = await UnmaskedPredicate.createFromToken(carolToken, carolSigningService, HashAlgorithm.SHA256);

  // Finish the transaction with the Carol predicate
  expect(carolTransaction.data.recipientDataHash).toBeNull();
  const finalizedCarolToken = await client.finalizeTransaction(
    trustBase,
    mintReasonFactory,
    carolToken,
    new TokenState(carolPredicate, null),
    carolTransaction,
  );

  expect(finalizedCarolToken.transactions).toHaveLength(2);
}

export async function testOfflineTransferFlow(trustBase: RootTrustBase, client: StateTransitionClient): Promise<void> {
  const mintReasonFactory = new DefaultMintReasonFactory();

  const data = createMintData(
    TokenCoinData.create([
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
      [new CoinId(crypto.getRandomValues(new Uint8Array(32))), BigInt(Math.round(Math.random() * 90)) + 10n],
    ]),
  );

  const token = await mintToken(aliceSecret, trustBase, mintReasonFactory, client, data);

  // Recipient prepares the info for the transfer
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const bobSigningService = await SigningService.createFromSecret(bobSecret, nonce);
  const recipientPredicate = MaskedPredicate.createFromToken(token, bobSigningService, HashAlgorithm.SHA256, nonce);

  const receivingAddress = await recipientPredicate.getReference().then((reference) => reference.toAddress());

  const aliceSigningService = await SigningService.createFromSecret(aliceSecret, data.nonce);
  const commitment = await TransferCommitment.create(
    token,
    receivingAddress,
    crypto.getRandomValues(new Uint8Array(32)),
    await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
    textEncoder.encode('my message'),
    aliceSigningService,
  );

  // Test the full JSON serialization cycle that would happen in real usage
  // 1. Get JSON representation of the offline transaction
  const commitmentJson = JSON.stringify(commitment);
  const tokenJson = JSON.stringify(token);

  // 3. Deserialize back to object
  //...sender sends the "package" offline to the recipient
  const importedToken = await Token.fromJSON(JSON.parse(tokenJson));
  const importedCommitment = await TransferCommitment.fromJSON(JSON.parse(commitmentJson));

  // Recipient imports token (offline json file transfer)
  const response = await client.submitTransferCommitment(importedCommitment);
  expect(response.status).toEqual(CertificationStatus.SUCCESS);

  // Finish the transaction with the recipient predicate
  const updateToken = await client.finalizeTransaction(
    trustBase,
    mintReasonFactory,
    importedToken,
    new TokenState(recipientPredicate, textEncoder.encode('my custom data')),
    importedCommitment.toTransaction(await waitInclusionProof(trustBase, client, importedCommitment)),
  );

  await expect(
    updateToken.verify(trustBase, mintReasonFactory).then((result) => result.isSuccessful),
  ).resolves.toBeTruthy();
  expect(updateToken.id).toEqual(token.id);
  expect(updateToken.type).toEqual(token.type);
  expect(updateToken.data).toEqual(token.data);
  expect(updateToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

  // Verify the original minted token has been spent
  await expect(client.isTokenStateSpent(trustBase, token, aliceSigningService.publicKey)).resolves.toBeTruthy();

  // Verify the updated token has not been spent
  await expect(client.isTokenStateSpent(trustBase, updateToken, bobSigningService.publicKey)).resolves.toBeFalsy();
}

export async function testSplitFlow(trustBase: RootTrustBase, client: StateTransitionClient): Promise<void> {
  const mintReasonFactory = new DefaultMintReasonFactory();

  // First, let's mint a token in the usual way.
  const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
  const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

  const coinData = TokenCoinData.create([
    [unicityToken, 10n],
    [alphaToken, 20n],
  ]);

  const mintTokenData = createMintData(coinData);
  const token = await mintToken(aliceSecret, trustBase, mintReasonFactory, client, mintTokenData);

  const coinsPerNewTokens = [
    TokenCoinData.create([
      [unicityToken, 10n],
      [alphaToken, 5n],
    ]),
    TokenCoinData.create([[alphaToken, 15n]]),
  ];

  const splitTokens = await splitToken(
    trustBase,
    mintReasonFactory,
    token,
    coinsPerNewTokens,
    aliceSecret,
    mintTokenData.nonce,
    'my custom data',
    client,
  );

  performCheckForSplitTokens(splitTokens, coinsPerNewTokens);
}

export async function testSplitFlowAfterTransfer(
  trustBase: RootTrustBase,
  client: StateTransitionClient,
): Promise<void> {
  const mintReasonFactory = new DefaultMintReasonFactory();

  const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
  const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

  const coinData = TokenCoinData.create([
    [unicityToken, 100n],
    [alphaToken, 100n],
  ]);

  const mintTokenData = createMintData(coinData);
  const token = await mintToken(aliceSecret, trustBase, mintReasonFactory, client, mintTokenData);

  // Perform 1st split
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
    trustBase,
    mintReasonFactory,
    token,
    coinsPerNewTokens,
    aliceSecret,
    mintTokenData.nonce,
    'my custom data',
    client,
  );

  performCheckForSplitTokens(splitTokens, coinsPerNewTokens);

  const receiverNonce = crypto.getRandomValues(new Uint8Array(32));
  const recipientSigningService = await SigningService.createFromSecret(bobSecret, receiverNonce);

  const reference = await MaskedPredicateReference.createFromSigningService(
    splitTokens[0].type,
    recipientSigningService,
    HashAlgorithm.SHA256,
    receiverNonce,
  );
  const recipientAddress = await reference.toAddress();

  const splitTokenPredicate = (await PredicateEngineService.createPredicate(
    splitTokens[0].state.predicate,
  )) as MaskedPredicate;

  // Create transfer transaction
  const sendTokenTx = await sendToken(
    trustBase,
    client,
    splitTokens[0],
    await SigningService.createFromSecret(aliceSecret, splitTokenPredicate.nonce),
    recipientAddress,
  );

  //sender export token with transfer transaction
  const tokenJson = JSON.stringify(splitTokens[0].toJSON());

  // Recipient imports token and transaction
  const receiverImportedToken = await Token.fromJSON(JSON.parse(tokenJson));

  const importedTransaction = await TransferTransaction.fromJSON(JSON.parse(JSON.stringify(sendTokenTx.toJSON())));

  const maskedPredicate = MaskedPredicate.createFromToken(
    receiverImportedToken,
    recipientSigningService,
    HashAlgorithm.SHA256,
    receiverNonce,
  );

  // Finish the transaction with the recipient predicate
  const updateToken = await client.finalizeTransaction(
    trustBase,
    mintReasonFactory,
    receiverImportedToken,
    new TokenState(maskedPredicate, textEncoder.encode('my custom data')),
    importedTransaction,
  );

  await expect(
    updateToken.verify(trustBase, mintReasonFactory).then((result) => result.isSuccessful),
  ).resolves.toBeTruthy();
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
    trustBase,
    mintReasonFactory,
    updateToken,
    coinsPerNewTokens2,
    bobSecret,
    receiverNonce,
    'my custom data',
    client,
  );

  performCheckForSplitTokens(splitTokens2, coinsPerNewTokens2);
}

async function splitToken(
  trustBase: RootTrustBase,
  mintReasonFactory: DefaultMintReasonFactory,
  token: Token,
  coinsPerNewTokens: TokenCoinData[],
  ownerSecret: Uint8Array,
  nonce: Uint8Array,
  customDataString: string,
  client: StateTransitionClient,
): Promise<Token[]> {
  const builder = new TokenSplitBuilder();
  const nonces = new Map<string, Uint8Array>();
  for (const coins of coinsPerNewTokens) {
    const tokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const tokenType = new TokenType(crypto.getRandomValues(new Uint8Array(32)));
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signingService = await SigningService.createFromSecret(ownerSecret, nonce);

    const predicateReference = await MaskedPredicateReference.createFromSigningService(
      tokenType,
      signingService,
      HashAlgorithm.SHA256,
      nonce,
    );
    nonces.set(tokenId.toJSON(), nonce);

    builder.createToken(
      tokenId,
      tokenType,
      null,
      coins,
      await predicateReference.toAddress(),
      crypto.getRandomValues(new Uint8Array(32)),
      await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(customDataString)).digest(),
    );
  }

  const tokenSplitRequest = await builder.build(token);
  const commitment = await tokenSplitRequest.createBurnCommitment(
    crypto.getRandomValues(new Uint8Array(32)),
    await SigningService.createFromSecret(ownerSecret, nonce),
  );

  const response = await client.submitTransferCommitment(commitment);
  expect(response.status).toEqual(CertificationStatus.SUCCESS);

  const splittedTokenMintCommitments = await tokenSplitRequest.createSplitMintCommitments(
    trustBase,
    mintReasonFactory,
    commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment)),
  );

  return Promise.all(
    splittedTokenMintCommitments.map(async (commitment) => {
      const response = await client.submitMintCommitment(commitment);
      if (response.status !== CertificationStatus.SUCCESS) {
        throw new Error(`Submitting mint commitment failed: ${response.status}`);
      }

      const nonce = nonces.get(commitment.transactionData.tokenId.toJSON())!;
      const transaction = commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment));
      return Token.mint(
        trustBase,
        mintReasonFactory,
        new TokenState(
          MaskedPredicate.createFromMintTransaction(
            transaction,
            await SigningService.createFromSecret(ownerSecret, nonce),
            HashAlgorithm.SHA256,
            nonce,
          ),
          textEncoder.encode(customDataString),
        ),
        transaction,
      );
    }),
  );
}
