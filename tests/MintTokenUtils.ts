import { DirectAddress } from '../src/address/DirectAddress.js';
import { CertificationStatus } from '../src/api/CertificationResponse.js';
import { RootTrustBase } from '../src/bft/RootTrustBase.js';
import { DataHasher } from '../src/hash/DataHasher.js';
import { HashAlgorithm } from '../src/hash/HashAlgorithm.js';
import { MaskedPredicate } from '../src/predicate/embedded/MaskedPredicate.js';
import { MaskedPredicateReference } from '../src/predicate/embedded/MaskedPredicateReference.js';
import { SigningService } from '../src/sign/SigningService.js';
import { StateTransitionClient } from '../src/StateTransitionClient.js';
import { TokenCoinData } from '../src/token/fungible/TokenCoinData.js';
import { Token } from '../src/token/Token.js';
import { TokenId } from '../src/token/TokenId.js';
import { TokenState } from '../src/token/TokenState.js';
import { TokenType } from '../src/token/TokenType.js';
import { DefaultMintReasonFactory } from '../src/transaction/DefaultMintReasonFactory.js';
import { IMintTransactionReason } from '../src/transaction/IMintTransactionReason.js';
import { MintCommitment } from '../src/transaction/MintCommitment.js';
import { MintTransactionData } from '../src/transaction/MintTransactionData.js';
import { TransferCommitment } from '../src/transaction/TransferCommitment.js';
import { TransferTransaction } from '../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../src/util/InclusionProofUtils.js';

export interface IMintData {
  tokenId: TokenId;
  tokenType: TokenType;
  tokenData: Uint8Array | null;
  coinData: TokenCoinData | null;
  data: Uint8Array | null;
  salt: Uint8Array;
  nonce: Uint8Array;
}

export function createMintData(
  coinData: TokenCoinData | null = null,
  tokenData: Uint8Array | null = crypto.getRandomValues(new Uint8Array(32)),
  data: Uint8Array | null = crypto.getRandomValues(new Uint8Array(32)),
): IMintData {
  const tokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = new TokenType(crypto.getRandomValues(new Uint8Array(32)));

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(32));

  return {
    coinData,
    data,
    nonce,
    salt,
    tokenData,
    tokenId,
    tokenType,
  };
}

export async function mintToken(
  secret: Uint8Array,
  trustBase: RootTrustBase,
  mintReasonFactory: DefaultMintReasonFactory,
  client: StateTransitionClient,
  data: IMintData,
  reason: IMintTransactionReason | null = null,
): Promise<Token> {
  const signingService = await SigningService.createFromSecret(secret, data.nonce);
  const predicateReference = await MaskedPredicateReference.createFromSigningService(
    data.tokenType,
    signingService,
    HashAlgorithm.SHA256,
    data.nonce,
  );

  const commitment = await MintCommitment.create(
    await MintTransactionData.createFromReason(
      data.tokenId,
      data.tokenType,
      data.tokenData,
      data.coinData,
      await predicateReference.toAddress(),
      data.salt,
      data.data ? await new DataHasher(HashAlgorithm.SHA256).update(data.data).digest() : null,
      reason,
    ),
  );

  const response = await client.submitMintCommitment(commitment);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Failed to submit mint commitment: ${response.status}`);
  }

  const transaction = commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment));

  return Token.mint(
    trustBase,
    mintReasonFactory,
    new TokenState(
      MaskedPredicate.create(
        transaction.data.tokenId,
        transaction.data.tokenType,
        signingService,
        HashAlgorithm.SHA256,
        data.nonce,
      ),
      data.data,
    ),
    transaction,
  );
}

export async function sendToken(
  trustBase: RootTrustBase,
  client: StateTransitionClient,
  token: Token,
  signingService: SigningService,
  recipient: DirectAddress,
  tokenState: string | null = 'my custom data',
): Promise<TransferTransaction> {
  const textEncoder = new TextEncoder();
  const stateHash = tokenState
    ? await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(tokenState)).digest()
    : null;
  const commitment = await TransferCommitment.create(
    token,
    recipient,
    crypto.getRandomValues(new Uint8Array(32)),
    stateHash,
    textEncoder.encode('my message'),
    signingService,
  );

  const response = await client.submitTransferCommitment(commitment);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Failed to submit transaction commitment: ${response.status}`);
  }

  return commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment));
}
