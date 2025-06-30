import { InclusionProof, InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import {
  SubmitCommitmentResponse,
  SubmitCommitmentStatus,
} from '@unicitylabs/commons/lib/api/SubmitCommitmentResponse.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DirectAddress } from './address/DirectAddress.js';
import { IAggregatorClient } from './api/IAggregatorClient.js';
import { ISerializable } from './ISerializable.js';
import { NameTagToken } from './token/NameTagToken.js';
import { Token } from './token/Token.js';
import { TokenState } from './token/TokenState.js';
import { Commitment } from './transaction/Commitment.js';
import { MintTransactionData } from './transaction/MintTransactionData.js';
import { Transaction } from './transaction/Transaction.js';
import { TransactionData } from './transaction/TransactionData.js';

// I_AM_UNIVERSAL_MINTER_FOR_ string bytes
/**
 * Secret prefix for the signing used internally when minting tokens.
 */
export const MINTER_SECRET = HexConverter.decode('495f414d5f554e4956455253414c5f4d494e5445525f464f525f');

/**
 * High level client implementing the token state transition workflow.
 */
export class StateTransitionClient {
  /**
   * @param client Implementation used to talk to an aggregator
   */
  public constructor(public readonly client: IAggregatorClient) {}

  /**
   * Create and submit a mint transaction for a new token.
   * @param transactionData Mint transaction data containing token information and address.
   * @returns Commitment containing the transaction data and authenticator
   * @throws Error when the aggregator rejects the transaction
   *
   * @example
   * ```ts
   * const commitment = await client.submitMintTransaction(
   *   await MintTransactionData.create(
   *     TokenId.create(crypto.getRandomValues(new Uint8Array(32))),
   *     TokenType.create(crypto.getRandomValues(new Uint8Array(32))),
   *     new Uint8Array(),
   *     null,
   *     await DirectAddress.create(mintTokenData.predicate.reference),
   *     crypto.getRandomValues(new Uint8Array(32)),
   *     null,
   *     null
   *   )
   * );
   * ```
   */
  public async submitMintTransaction<T extends MintTransactionData<ISerializable | null>>(
    transactionData: T,
  ): Promise<Commitment<T>> {
    const commitment = await Commitment.create(
      transactionData,
      await SigningService.createFromSecret(MINTER_SECRET, transactionData.tokenId.bytes),
    );

    const result = await this.client.submitTransaction(
      commitment.requestId,
      commitment.transactionData.hash,
      commitment.authenticator,
    );

    if (result.status !== SubmitCommitmentStatus.SUCCESS) {
      throw new Error(`Could not submit transaction: ${result.status}`);
    }

    return commitment;
  }

  /**
   * Submit a state transition for an existing token.
   *
   * @param {Commitment} commitment Commitment containing the request information
   * @returns Commitment ready for inclusion proof retrieval
   * @throws Error if ownership verification fails or aggregator rejects
   *
   * @example
   * ```ts
   * const commitment = await client.submitTransaction(data, signingService);
   * ```
   */
  public submitCommitment(commitment: Commitment<TransactionData>): Promise<SubmitCommitmentResponse> {
    if (!commitment.transactionData.sourceState.unlockPredicate.isOwner(commitment.authenticator.publicKey)) {
      throw new Error('Ownership verification failed: Authenticator does not match source state predicate.');
    }

    return this.client.submitTransaction(
      commitment.requestId,
      commitment.transactionData.hash,
      commitment.authenticator,
    );
  }

  /**
   * Build a {@link Transaction} object once an inclusion proof is obtained.
   *
   * @param param0       Commitment returned from submit* methods
   * @param inclusionProof Proof of inclusion from the aggregator
   * @returns Constructed transaction object
   * @throws Error if the inclusion proof is invalid
   *
   * @example
   * ```ts
   * const tx = await client.createTransaction(commitment, inclusionProof);
   * ```
   */
  public async createTransaction<T extends TransactionData | MintTransactionData<ISerializable | null>>(
    { requestId, transactionData }: Commitment<T>,
    inclusionProof: InclusionProof,
  ): Promise<Transaction<T>> {
    const status = await inclusionProof.verify(requestId);
    if (status != InclusionProofVerificationStatus.OK) {
      throw new Error('Inclusion proof verification failed.');
    }

    if (!inclusionProof.authenticator || !HashAlgorithm[inclusionProof.authenticator.stateHash.algorithm]) {
      throw new Error('Invalid inclusion proof hash algorithm.');
    }

    if (!inclusionProof.transactionHash?.equals(transactionData.hash)) {
      throw new Error('Payload hash mismatch');
    }

    return new Transaction(transactionData, inclusionProof);
  }

  /**
   * Finalise a transaction and produce the next token state.
   *
   * @param token           Token being transitioned
   * @param state           New state after the transition
   * @param transaction     Transaction proving the state change
   * @param nametagTokens   Optional name tag tokens associated with the transfer
   * @returns Updated token instance
   * @throws Error if validation checks fail
   *
   * @example
   * ```ts
   * const updated = await client.finishTransaction(token, state, tx);
   * ```
   */
  public async finishTransaction<T extends Transaction<MintTransactionData<ISerializable | null>>>(
    token: Token<T>,
    state: TokenState,
    transaction: Transaction<TransactionData>,
    nametagTokens: NameTagToken[] = [],
  ): Promise<Token<T>> {
    if (!(await transaction.data.sourceState.unlockPredicate.verify(transaction))) {
      throw new Error('Predicate verification failed');
    }

    // TODO: Move address processing to a separate method
    // TODO: Resolve proxy address
    const expectedAddress = await DirectAddress.create(state.unlockPredicate.reference);
    if (expectedAddress.toJSON() !== transaction.data.recipient) {
      throw new Error('Recipient address mismatch');
    }

    const transactions: Transaction<TransactionData>[] = [...token.transactions, transaction];

    if (!(await transaction.containsData(state.data))) {
      throw new Error('State data is not part of transaction.');
    }

    return new Token(state, token.genesis, transactions, nametagTokens);
  }

  /**
   * Query the ledger to see if the token's current state has been spent.
   *
   * @param token     Token to check
   * @param publicKey Public key of the owner
   * @returns Verification status reported by the aggregator
   *
   * @example
   * ```ts
   * const status = await client.getTokenStatus(token, ownerPublicKey);
   * ```
   */
  public async getTokenStatus(
    token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
    publicKey: Uint8Array,
  ): Promise<InclusionProofVerificationStatus> {
    const requestId = await RequestId.create(publicKey, token.state.hash);
    const inclusionProof = await this.client.getInclusionProof(requestId);
    // TODO: Check ownership?
    return inclusionProof.verify(requestId);
  }

  /**
   * Convenience helper to retrieve the inclusion proof for a commitment.
   *
   * @example
   * ```ts
   * const proof = await client.getInclusionProof(commitment);
   * ```
   */
  public getInclusionProof(
    commitment: Commitment<TransactionData | MintTransactionData<ISerializable | null>>,
  ): Promise<InclusionProof> {
    return this.client.getInclusionProof(commitment.requestId);
  }
}
