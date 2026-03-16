import * as crypto from 'node:crypto';

import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';
import { IPathJson, ISumPathJson } from '@unicitylabs/prefix-hash-tree/lib/index.js';
import { HashOptions, Path } from '@unicitylabs/prefix-hash-tree/lib/smt.js';
import { SumPath } from '@unicitylabs/prefix-hash-tree/lib/sumtree.js';

import { DirectAddress } from '../../src/address/DirectAddress.js';
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { ISerializable } from '../../src/ISerializable.js';
import { MaskedPredicate } from '../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../src/predicate/PredicateFactory.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { CoinId } from '../../src/token/fungible/CoinId.js';
import { TokenCoinData } from '../../src/token/fungible/TokenCoinData.js';
import { ITokenJson, Token } from '../../src/token/Token.js';
import { SplitProof, TokenFactory } from '../../src/token/TokenFactory.js';
import { TokenId } from '../../src/token/TokenId.js';
import { TokenState } from '../../src/token/TokenState.js';
import { TokenType } from '../../src/token/TokenType.js';
import { MintTransactionData } from '../../src/transaction/MintTransactionData.js';
import { ITransactionJson, Transaction } from '../../src/transaction/Transaction.js';
import { ITransactionDataJson, TransactionData } from '../../src/transaction/TransactionData.js';
import { waitInclusionProof } from '../InclusionProofUtils.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';
import { TestTokenData } from '../TestTokenData.js';

const textEncoder = new TextEncoder();

interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: TestTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

async function createMintData(secret: Uint8Array, coinData: TokenCoinData): Promise<IMintData> {
  const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));

  const data = crypto.getRandomValues(new Uint8Array(32));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const predicate = await MaskedPredicate.create(
    tokenId,
    tokenType,
    await SigningService.createFromSecret(secret, nonce),
    HashAlgorithm.SHA256,
    nonce,
  );

  return {
    coinData,
    data,
    nonce,
    predicate,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}

async function createMintTokenDataForSplit(
  tokenId: TokenId,
  secret: Uint8Array,
  tokenType: TokenType,
  coinData: TokenCoinData,
): Promise<IMintData> {
  const tokenData = new TestTokenData(crypto.getRandomValues(new Uint8Array(32)));

  const data = crypto.getRandomValues(new Uint8Array(32));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  const signingService = await SigningService.createFromSecret(secret, nonce);
  const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);

  return {
    coinData,
    data,
    nonce,
    predicate,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}

async function mintToken(
  client: StateTransitionClient,
  data: IMintData,
): Promise<Token<TestTokenData, MintTransactionData<null>>> {
  const mintCommitment = await client.submitMintTransaction(
    await DirectAddress.create(data.predicate.reference),
    data.tokenId,
    data.tokenType,
    data.tokenData,
    data.coinData,
    data.salt,
    await new DataHasher(HashAlgorithm.SHA256).update(data.data).digest(),
    null,
  );

  const mintTransaction = await client.createTransaction(
    mintCommitment,
    await waitInclusionProof(client, mintCommitment),
  );

  return new Token(
    data.tokenId,
    data.tokenType,
    data.tokenData,
    data.coinData,
    await TokenState.create(data.predicate, data.data),
    [mintTransaction],
  );
}

async function sendToken(
  client: StateTransitionClient,
  token: Token<ISerializable, MintTransactionData<ISerializable | null>>,
  signingService: SigningService,
  recipient: DirectAddress,
): Promise<Transaction<TransactionData>> {
  const transactionData = await TransactionData.create(
    token.state,
    recipient.toJSON(),
    crypto.getRandomValues(new Uint8Array(32)),
    await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
    textEncoder.encode('my message'),
    token.nametagTokens,
  );

  const commitment = await client.submitTransaction(transactionData, signingService);
  return await client.createTransaction(commitment, await waitInclusionProof(client, commitment));
}

const initialOwnerSecret = new TextEncoder().encode('secret1');
const receiverSecret = new TextEncoder().encode('secret2');

describe('Transition 2', function () {
  const url_test = 'https://gateway-test.unicity.network';
  const url_main = 'https://gateway.unicity.network';
  const url_local = 'http://localhost:8080';
  const url = url_test;

  const sumTreeHasherFactory = new DataHasherFactory(NodeDataHasher);
  const sumTreeHashAlgorithm = HashAlgorithm.SHA256;

  const client = new StateTransitionClient(new AggregatorClient(url));

  const unicityToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));
  const alphaToken = new CoinId(crypto.getRandomValues(new Uint8Array(32)));

  // const senderNonce = crypto.getRandomValues(new Uint8Array(32));
  // console.log("Sender nonce (base64):", Buffer.from(senderNonce).toString("base64"));
  const receiverNonce = crypto.getRandomValues(new Uint8Array(32));
  console.log('Receiver nonce (base64):', Buffer.from(receiverNonce).toString('base64'));

  it('should split tokens 2', async () => {
    const coinData = new TokenCoinData([
      [unicityToken, 10n],
      [alphaToken, 20n],
    ]);

    const mintTokenData = await createMintData(initialOwnerSecret, coinData);
    const mintCommitment = await client.submitMintTransaction(
      await DirectAddress.create(mintTokenData.predicate.reference),
      mintTokenData.tokenId,
      mintTokenData.tokenType,
      mintTokenData.tokenData,
      mintTokenData.coinData,
      mintTokenData.salt,
      await new DataHasher(HashAlgorithm.SHA256).update(mintTokenData.data).digest(),
      null,
    );

    const mintTransaction = await client.createTransaction(
      mintCommitment,
      await waitInclusionProof(client, mintCommitment),
    );

    const token = new Token(
      mintTokenData.tokenId,
      mintTokenData.tokenType,
      mintTokenData.tokenData,
      mintTokenData.coinData,
      await TokenState.create(mintTokenData.predicate, mintTokenData.data),
      [mintTransaction],
    );

    // Now let's split that token into 2 tokens.

    const coinsPerNewTokens = [
      new TokenCoinData([
        [unicityToken, 10n],
        [alphaToken, 5n],
      ]),
      new TokenCoinData([[alphaToken, 15n]]),
    ];

    const splitTokens = await splitToken(
      token,
      coinsPerNewTokens,
      initialOwnerSecret,
      mintTokenData.nonce,
      'my custom data',
      'my message',
    );

    performCheckForSplitTokens(splitTokens, coinsPerNewTokens);

    const signingService = await SigningService.createFromSecret(
      initialOwnerSecret,
      splitTokens[0].state.unlockPredicate.nonce,
    );
    expect(splitTokens[0].state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();

    const recipientSigningService = await SigningService.createFromSecret(receiverSecret, receiverNonce);

    console.log('Public Key  (hex):', HexConverter.encode(recipientSigningService.publicKey));

    const reference = await MaskedPredicate.calculateReference(
      splitTokens[0].type,
      'secp256k1',
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

    //sender export token
    const tokenJson = exportFlow(splitTokens[0], sendTokenTx, true);

    console.log(tokenJson);

    // Recipient imports token
    const receiverImportedToken = await new TokenFactory(new PredicateFactory()).create(
      JSON.parse(tokenJson).token,
      TestTokenData.fromJSON,
    );

    const importedTransaction = await Transaction.fromJSON(
      receiverImportedToken.id,
      receiverImportedToken.type,
      JSON.parse(tokenJson).transaction as ITransactionJson<ITransactionDataJson>,
      new PredicateFactory(),
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
    expect(updateToken.data.toJSON()).toEqual(splitTokens[0].data.toJSON());
    expect(updateToken.coins?.toJSON()).toEqual(splitTokens[0].coins?.toJSON());

    console.log(JSON.stringify(updateToken.toJSON()));
    console.log(
      '******************************************* Sent token on receiver side *******************************************',
    );
    console.log(exportFlow(updateToken, null, true));

    // Now let's split that token into 2 tokens.

    const coinsPerNewTokens2 = [
      new TokenCoinData([
        [unicityToken, 5n],
        [alphaToken, 3n],
      ]),
      new TokenCoinData([
        [unicityToken, 5n],
        [alphaToken, 2n],
      ]),
    ];

    //coinsPerNewTokens2.length

    const splitTokens2 = await splitToken(
      updateToken,
      coinsPerNewTokens2,
      receiverSecret,
      receiverNonce,
      'my custom data',
      'my custom message',
    );

    console.log(
      '******************************************* Split token 1.1 *******************************************',
    );
    console.log(exportFlow(splitTokens2[0], null, true));

    console.log(
      '******************************************* Split token 2.1 *******************************************',
    );
    console.log(exportFlow(splitTokens2[1], null, true));

    // performCheckForSplitTokens(splitTokens2,coinsPerNewTokens2)
    //     expect(splitTokens2.length).toEqual(coinsPerNewTokens2.length);
    //
    //     expect(splitTokens2[0]!.coins!.toString()).toEqual(
    //         dedent`
    //     FungibleTokenData
    //       ${unicityToken.toJSON()}: 5
    //       ${alphaToken.toJSON()}: 3`);
    //
    //     expect(splitTokens2[1]!.coins!.toString()).toEqual(
    //         dedent`
    //     FungibleTokenData
    //       ${unicityToken.toJSON()}: 5
    //       ${alphaToken.toJSON()}: 2`);

    performCheckForSplitTokens(splitTokens2, coinsPerNewTokens2);
  }, 250000);

  function performCheckForSplitTokens(actualTokens: Token<any, any>[], expectedCoinDataList: TokenCoinData[]) {
    expect(actualTokens.length).toEqual(expectedCoinDataList.length);

    actualTokens.forEach((actualToken, index) => {
      const expectedCoins = expectedCoinDataList[index].coins;

      const actualCoins = actualToken.coins?.coins;
      if (!actualCoins) {
        throw new Error(`actualToken at index ${index} has no coins`);
      }

      const expectedMap = new Map(expectedCoins.map(([id, amount]) => [id.toJSON(), amount]));
      const actualMap = new Map(actualCoins.map(([id, amount]) => [id.toJSON(), amount]));

      expect(actualMap).toEqual(expectedMap);

      // Optional debug log:
      console.log(`✅ Split token #${index} matches expected:`);
      for (const [id, amount] of actualCoins) {
        console.log(`   ${id.toJSON()}: ${amount}`);
      }
    });
  }

  async function splitToken(token, coinsPerNewTokens, ownerSecret, nonce, customDataString, customMessage) {
    const { commitment, recipientPredicate, newTokenIds, allCoinsTree, coinTrees } =
      await client.submitBurnTransactionForSplit(
        token,
        coinsPerNewTokens,
        sumTreeHasherFactory,
        sumTreeHashAlgorithm,
        ownerSecret,
        nonce,
        await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(customDataString)).digest(),
        textEncoder.encode(customMessage),
      );

    const transaction = await client.createTransaction(commitment, await waitInclusionProof(client, commitment));

    const updatedToken = await client.finishTransaction(
      token,
      await TokenState.create(recipientPredicate, textEncoder.encode(customDataString)),
      transaction,
    );

    const splitTokenData: IMintData[] = await Promise.all(
      coinsPerNewTokens.map(
        async (tokenCoinData, index) =>
          await createMintTokenDataForSplit(newTokenIds[index], initialOwnerSecret, token.type, tokenCoinData),
      ),
    );

    const splitTokens = await Promise.all(
      splitTokenData.map(async (tokenData) => {
        const burnProofs: Map<string, [Path, SumPath]> = new Map();
        for (const [coinId, amount] of tokenData.coinData.coins) {
          const pathToCoinTree = await allCoinsTree.getProof(
            BigintConverter.decode(HexConverter.decode(coinId.toJSON())),
          );
          const pathToCoinAmount = await coinTrees
            .get(coinId.toJSON())!
            .getProof(BigintConverter.decode(HexConverter.decode(tokenData.tokenId.toJSON())));
          burnProofs.set(coinId.toJSON(), [pathToCoinTree, pathToCoinAmount]);
        }

        const mintCommitment = await client.submitMintTransaction(
          await DirectAddress.create(tokenData.predicate.reference),
          tokenData.tokenId,
          tokenData.tokenType,
          tokenData.tokenData,
          tokenData.coinData,
          tokenData.salt,
          await new DataHasher(HashAlgorithm.SHA256).update(tokenData.data).digest(),
          new SplitProof(updatedToken, burnProofs),
        );
        const mintTransaction = await client.createTransaction(
          mintCommitment,
          await waitInclusionProof(client, mintCommitment),
        );
        return new Token(
          tokenData.tokenId,
          tokenData.tokenType,
          tokenData.tokenData,
          tokenData.coinData,
          await TokenState.create(tokenData.predicate, tokenData.data),
          [mintTransaction],
        );
      }),
    );

    const signingService = await SigningService.createFromSecret(
      initialOwnerSecret,
      splitTokens[0].state.unlockPredicate.nonce,
    );
    expect(splitTokens[0].state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();

    return splitTokens;
  }

  // TODO: Should this function be moved into a different location in the library?
  function exportFlow(token, transaction, pretify) {
    const flow = { token, transaction };
    return pretify ? JSON.stringify(flow, null, 4) : JSON.stringify(flow);
  }
});
