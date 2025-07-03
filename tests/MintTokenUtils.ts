import { SubmitCommitmentStatus } from '@unicitylabs/commons/lib/api/SubmitCommitmentResponse.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';

import { TestTokenData } from './TestTokenData.js';
import { DirectAddress } from '../src/address/DirectAddress.js';
import { ISerializable } from '../src/ISerializable.js';
import { MaskedPredicate } from '../src/predicate/MaskedPredicate.js';
import { StateTransitionClient } from '../src/StateTransitionClient.js';
import { TokenCoinData } from '../src/token/fungible/TokenCoinData.js';
import { Token } from '../src/token/Token.js';
import { TokenId } from '../src/token/TokenId.js';
import { TokenState } from '../src/token/TokenState.js';
import { TokenType } from '../src/token/TokenType.js';
import { Commitment } from '../src/transaction/Commitment.js';
import { MintTransactionData } from '../src/transaction/MintTransactionData.js';
import { Transaction } from '../src/transaction/Transaction.js';
import { TransactionData } from '../src/transaction/TransactionData.js';
import { waitInclusionProof } from '../src/utils/InclusionProofUtils.js';

export interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: TestTokenData;
  coinData: TokenCoinData;
  data: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  predicate: MaskedPredicate;
}

export async function createMintData(secret: Uint8Array, coinData: TokenCoinData): Promise<IMintData> {
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

export async function mintToken(
  client: StateTransitionClient,
  data: IMintData,
): Promise<Token<Transaction<MintTransactionData<null>>>> {
  const mintCommitment = await client.submitMintTransaction(
    await MintTransactionData.create(
      data.tokenId,
      data.tokenType,
      data.tokenData.toCBOR(),
      data.coinData,
      (await DirectAddress.create(data.predicate.reference)).toString(),
      data.salt,
      await new DataHasher(HashAlgorithm.SHA256).update(data.data).digest(),
      null,
    ),
  );

  const mintTransaction = await client.createTransaction(
    mintCommitment,
    await waitInclusionProof(client, mintCommitment),
  );

  return new Token(await TokenState.create(data.predicate, data.data), mintTransaction, []);
}

export async function sendToken(
  client: StateTransitionClient,
  token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
  signingService: SigningService,
  recipient: DirectAddress,
): Promise<Transaction<TransactionData>> {
  const textEncoder = new TextEncoder();
  const transactionData = await TransactionData.create(
    token.state,
    recipient.toJSON(),
    crypto.getRandomValues(new Uint8Array(32)),
    await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode('my custom data')).digest(),
    textEncoder.encode('my message'),
    token.nametagTokens,
  );

  const commitment = await Commitment.create(transactionData, signingService);
  const response = await client.submitCommitment(commitment);
  if (response.status !== SubmitCommitmentStatus.SUCCESS) {
    throw new Error(`Failed to submit transaction commitment: ${response.status}`);
  }

  return client.createTransaction(commitment, await waitInclusionProof(client, commitment));
}
