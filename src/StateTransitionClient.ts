import { DirectAddress } from './address/DirectAddress.js';
import { IAggregatorClient } from './api/IAggregatorClient.js';
import { RequestId } from './api/RequestId.js';
import { SubmitCommitmentResponse, SubmitCommitmentStatus } from './api/SubmitCommitmentResponse.js';
import { RootTrustBase } from './bft/RootTrustBase.js';
import { HashAlgorithm } from './hash/HashAlgorithm.js';
import { ISerializable } from './ISerializable.js';
import { PredicateEngineService } from './predicate/PredicateEngineService.js';
import { SigningService } from './sign/SigningService.js';
import { Token } from './token/Token.js';
import { TokenState } from './token/TokenState.js';
import { Commitment } from './transaction/Commitment.js';
import { IMintTransactionReason } from './transaction/IMintTransactionReason.js';
import { InclusionProof, InclusionProofVerificationStatus } from './transaction/InclusionProof.js';
import { MintCommitment } from './transaction/MintCommitment.js';
import { MintTransactionData } from './transaction/MintTransactionData.js';
import { Transaction } from './transaction/Transaction.js';
import { TransferTransaction } from './transaction/TransferTransaction.js';
import { TransferTransactionData } from './transaction/TransferTransactionData.js';
import { HexConverter } from './util/HexConverter.js';
import { InclusionProofResponse } from './api/InclusionProofResponse.js';

/**
 * High level client implementing the token state transition workflow.
 */
export class StateTransitionClient {
  /**
   * @param client Implementation used to talk to an aggregator
   */
  public constructor(public readonly client: IAggregatorClient) {}

  //
  //   /**
  //    * Finalizes a transaction by updating the token state based on the provided transaction data
  //    * without nametags.
  //    *
  //    * @param trustBase   The root trust base for inclusion proof verification.
  //    * @param token       The token to be updated.
  //    * @param state       The current state of the token.
  //    * @param transaction The transaction containing transfer data.
  //    * @param <R>         The type of mint transaction data.
  //    * @return The updated token after applying the transaction.
  //    * @throws VerificationException if verification fails during the update process.
  //    */
  //   public <R extends MintTransactionReason> Token<R> finalizeTransaction(
  //       RootTrustBase trustBase,
  //       Token<R> token,
  //       TokenState state,
  //       TransferTransaction transaction
  //   ) throws VerificationException {
  //     return this.finalizeTransaction(trustBase, token, state, transaction, List.of());
  //   }
  //
  //   /**
  //    * Finalizes a transaction by updating the token state based on the provided transaction data and
  //    * nametags.
  //    *
  //    * @param trustBase   The root trust base for inclusion proof verification.
  //    * @param token       The token to be updated.
  //    * @param state       The current state of the token.
  //    * @param transaction The transaction containing transfer data.
  //    * @param nametags    A list of tokens used as nametags in the transaction.
  //    * @param <R>         The type of mint transaction data of token.
  //    * @return The updated token after applying the transaction.
  //    * @throws VerificationException if verification fails during the update process.
  //    */
  //   public <R extends MintTransactionReason> Token<R> finalizeTransaction(
  //       RootTrustBase trustBase,
  //       Token<R> token,
  //       TokenState state,
  //       TransferTransaction transaction,
  //       List<Token<?>> nametags
  //   ) throws VerificationException {
  //     Objects.requireNonNull(token, "Token is null");
  //
  //     return token.update(trustBase, state, transaction, nametags);
  //   }
  //
  //   /**
  //    * Retrieves the inclusion proof for a token and verifies its status against the provided public
  //    * key and trust base.
  //    *
  //    * @param token     The token for which to retrieve the inclusion proof.
  //    * @param publicKey The public key associated with the token.
  //    * @param trustBase The root trust base for verification.
  //    * @return A CompletableFuture that resolves to the inclusion proof verification status.
  //    */
  //   public CompletableFuture<InclusionProofVerificationStatus> getTokenStatus(
  //       Token<?> token,
  //       byte[] publicKey,
  //       RootTrustBase trustBase
  //   ) {
  //     RequestId requestId = RequestId.create(publicKey, token.getState().calculateHash());
  //     return this.client.getInclusionProof(requestId)
  //         .thenApply(response -> response.getInclusionProof().verify(requestId, trustBase));
  //   }
  //
  //   /**
  //    * Retrieves the inclusion proof for a given commitment.
  //    *
  //    * @param commitment The commitment for which to retrieve the inclusion proof.
  //    * @return A CompletableFuture that resolves to the inclusion proof response from the aggregator.
  //    */
  //   public CompletableFuture<InclusionProofResponse> getInclusionProof(Commitment<?> commitment) {
  //     return this.client.getInclusionProof(commitment.getRequestId());
  //   }

  public async submitMintCommitment<R extends IMintTransactionReason>(
    commitment: MintCommitment<R>,
  ): Promise<SubmitCommitmentResponse> {
    return this.client.submitCommitment(
      commitment.requestId,
      await commitment.transactionData.calculateHash(),
      commitment.authenticator,
    );
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
  public async submitTransferCommitment(
    commitment: Commitment<TransferTransactionData>,
  ): Promise<SubmitCommitmentResponse> {
    const predicate = await PredicateEngineService.createPredicate(commitment.transactionData.sourceState.predicate);
    if (!(await predicate.isOwner(commitment.authenticator.publicKey))) {
      throw new Error('Ownership verification failed: Authenticator does not match source state predicate.');
    }

    return this.client.submitCommitment(
      commitment.requestId,
      await commitment.transactionData.calculateHash(),
      commitment.authenticator,
    );
  }

  /**
   * Finalizes a transaction by updating the token state based on the provided transaction data and
   * nametags.
   *
   * @param trustBase   The root trust base for inclusion proof verification.
   * @param token       The token to be updated.
   * @param state       The current state of the token.
   * @param transaction The transaction containing transfer data.
   * @param nametags    A list of tokens used as nametags in the transaction.
   * @return The updated token after applying the transaction.
   */
  public finalizeTransaction<R extends IMintTransactionReason>(
    trustBase: RootTrustBase,
    token: Token<R>,
    state: TokenState,
    transaction: TransferTransaction,
    nametags: Token<IMintTransactionReason>[] = [],
  ): Promise<Token<R>> {
    return token.update(trustBase, state, transaction, nametags);
  }

  /**
   * Retrieves the inclusion proof for a token and verifies its status against the provided public
   * key and trust base.
   *
   * @param token     The token for which to retrieve the inclusion proof.
   * @param publicKey The public key associated with the token.
   * @param trustBase The root trust base for verification.
   * @return inclusion proof verification status.
   */
  public async getTokenStatus(
    trustBase: RootTrustBase,
    token: Token<IMintTransactionReason>,
    publicKey: Uint8Array,
  ): Promise<InclusionProofVerificationStatus> {
    const requestId = await RequestId.create(publicKey, await token.state.calculateHash());
    return this.client
      .getInclusionProof(requestId)
      .then((response) => response.inclusionProof.verify(trustBase, requestId));
  }

  /**
   * Retrieves the inclusion proof for a given commitment.
   *
   * @param commitment The commitment for which to retrieve the inclusion proof.
   * @return inclusion proof response from the aggregator.
   */
  public getInclusionProof(
    commitment: Commitment<TransferTransactionData | MintTransactionData<IMintTransactionReason>>,
  ): Promise<InclusionProofResponse> {
    return this.client.getInclusionProof(commitment.requestId);
  }
}
