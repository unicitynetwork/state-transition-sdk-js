import { IAggregatorClient } from './api/IAggregatorClient.js';
import { InclusionProofResponse } from './api/InclusionProofResponse.js';
import { RequestId } from './api/RequestId.js';
import { SubmitCommitmentResponse } from './api/SubmitCommitmentResponse.js';
import { RootTrustBase } from './bft/RootTrustBase.js';
import { PredicateEngineService } from './predicate/PredicateEngineService.js';
import { MintSigningService } from './sign/MintSigningService.js';
import { Token } from './token/Token.js';
import { TokenId } from './token/TokenId.js';
import { TokenState } from './token/TokenState.js';
import { Commitment } from './transaction/Commitment.js';
import { IMintTransactionReason } from './transaction/IMintTransactionReason.js';
import { InclusionProofVerificationStatus } from './transaction/InclusionProof.js';
import { MintCommitment } from './transaction/MintCommitment.js';
import { MintTransactionState } from './transaction/MintTransactionState.js';
import { TransferTransaction } from './transaction/TransferTransaction.js';
import { TransferTransactionData } from './transaction/TransferTransactionData.js';

/**
 * High level client implementing the token state transition workflow.
 */
export class StateTransitionClient {
  /**
   * @param client Implementation used to talk to an aggregator
   */
  public constructor(public readonly client: IAggregatorClient) {}

  /**
   * Submit a mint commitment to the aggregator.
   *
   * @param {MintCommitment} commitment Mint commitment
   * @returns Commitment ready for inclusion proof retrieval
   * @throws Error if aggregator rejects
   */
  public async submitMintCommitment(commitment: MintCommitment): Promise<SubmitCommitmentResponse> {
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
   * @param {RootTrustBase} trustBase   The root trust base for inclusion proof verification.
   * @param {Token} token       The token to be updated.
   * @param {TokenState} state       The current state of the token.
   * @param {TransferTransaction} transaction The transaction containing transfer data.
   * @param {Token} nametags    A list of tokens used as nametags in the transaction.
   * @return The updated token after applying the transaction.
   */
  public finalizeTransaction(
    trustBase: RootTrustBase,
    token: Token,
    state: TokenState,
    transaction: TransferTransaction,
    nametags: Token[] = [],
  ): Promise<Token> {
    return token.update(trustBase, state, transaction, nametags);
  }

  /**
   * Retrieves the inclusion proof for a given commitment.
   *
   * @param {RequestId} requestId The request ID of inclusion proof to retrieve.
   * @return inclusion proof response from the aggregator.
   */
  public getInclusionProof(requestId: RequestId): Promise<InclusionProofResponse> {
    return this.client.getInclusionProof(requestId);
  }

  /**
   * Check if state is already spent for given request id.
   *
   * @param {RootTrustBase} trustBase root trust base
   * @param {RequestId} requestId request id
   * @return true if state is spent, false otherwise.
   */
  public async isStateSpent(trustBase: RootTrustBase, requestId: RequestId): Promise<boolean> {
    const response = await this.getInclusionProof(requestId);
    const result = await response.inclusionProof.verify(trustBase, requestId);
    switch (result) {
      case InclusionProofVerificationStatus.OK:
        return true;
      case InclusionProofVerificationStatus.PATH_NOT_INCLUDED:
        return false;
      default:
        throw new Error(`Inclusion proof verification failed with status ${result}`);
    }
  }

  /**
   * Check if token state is already spent.
   * @param {RootTrustBase} trustBase trustBase
   * @param {Token} token token
   * @param {Uint8Array} publicKey public key
   * @return true if token state is spent, false otherwise
   */
  public async isTokenStateSpent(
    trustBase: RootTrustBase,
    token: Token,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    const pk = new Uint8Array(publicKey);
    const predicate = await PredicateEngineService.createPredicate(token.state.predicate);
    if (!(await predicate.isOwner(pk))) {
      throw new Error('Given key is not owner of the token.');
    }

    return this.isStateSpent(trustBase, await RequestId.create(pk, await token.state.calculateHash()));
  }

  /**
   * Check if token id is already minted.
   *
   * @param {RootTrustBase} trustBase root trust base
   * @param {TokenId} tokenId   token id
   * @return true if token id is spent, false otherwise.
   */
  public async isMinted(trustBase: RootTrustBase, tokenId: TokenId): Promise<boolean> {
    return this.isStateSpent(
      trustBase,
      await RequestId.create(
        await MintSigningService.create(tokenId).then((signingService) => signingService.publicKey),
        await MintTransactionState.create(tokenId),
      ),
    );
  }
}
