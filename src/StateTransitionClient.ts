import { CertificationResponse } from './api/CertificationResponse.js';
import { IAggregatorClient } from './api/IAggregatorClient.js';
import { InclusionProofResponse } from './api/InclusionProofResponse.js';
import { StateId } from './api/StateId.js';
import { RootTrustBase } from './bft/RootTrustBase.js';
import { PredicateEngineService } from './predicate/PredicateEngineService.js';
import { MintSigningService } from './sign/MintSigningService.js';
import { Token } from './token/Token.js';
import { TokenId } from './token/TokenId.js';
import { TokenState } from './token/TokenState.js';
import { Commitment } from './transaction/Commitment.js';
import { IMintReasonFactory } from './transaction/IMintReasonFactory.js';
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
  public submitMintCommitment(commitment: MintCommitment): Promise<CertificationResponse> {
    return this.client.submitCertificationRequest(commitment.certificationData, false);
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
  ): Promise<CertificationResponse> {
    const predicate = await PredicateEngineService.createPredicate(commitment.transactionData.sourceState.predicate);
    if (!(await predicate.isOwner(commitment.certificationData.publicKey))) {
      throw new Error('Ownership verification failed: Authenticator does not match source state predicate.');
    }

    return this.client.submitCertificationRequest(commitment.certificationData, false);
  }

  /**
   * Finalizes a transaction by updating the token state based on the provided transaction data and
   * nametags.
   *
   * @param {RootTrustBase} trustBase   The root trust base for inclusion proof verification.
   * @param {DefaultMintReasonFactory} mintReasonFactory Factory to create mint transaction reasons.
   * @param {Token} token       The token to be updated.
   * @param {TokenState} state       The current state of the token.
   * @param {TransferTransaction} transaction The transaction containing transfer data.
   * @param {Token} nametags    A list of tokens used as nametags in the transaction.
   * @return The updated token after applying the transaction.
   */
  public finalizeTransaction(
    trustBase: RootTrustBase,
    mintReasonFactory: IMintReasonFactory,
    token: Token,
    state: TokenState,
    transaction: TransferTransaction,
    nametags: Token[] = [],
  ): Promise<Token> {
    return token.update(trustBase, mintReasonFactory, state, transaction, nametags);
  }

  /**
   * Retrieves the inclusion proof for a given commitment.
   *
   * @param {StateId} stateId The state ID of inclusion proof to retrieve.
   * @return inclusion proof response from the aggregator.
   */
  public getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    return this.client.getInclusionProof(stateId);
  }

  /**
   * Check if state is already spent for given state id.
   *
   * @param {RootTrustBase} trustBase root trust base
   * @param {StateId} stateId state id
   * @return true if state is spent, false otherwise.
   */
  public async isStateSpent(trustBase: RootTrustBase, stateId: StateId): Promise<boolean> {
    const response = await this.getInclusionProof(stateId);
    const result = await response.inclusionProof.verify(trustBase, stateId);
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
  public async isTokenStateSpent(trustBase: RootTrustBase, token: Token, publicKey: Uint8Array): Promise<boolean> {
    const pk = new Uint8Array(publicKey);
    const predicate = await PredicateEngineService.createPredicate(token.state.predicate);
    if (!(await predicate.isOwner(pk))) {
      throw new Error('Given key is not owner of the token.');
    }

    return this.isStateSpent(trustBase, await StateId.create(pk, await token.state.calculateHash()));
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
      await StateId.create(
        await MintSigningService.create(tokenId).then((signingService) => signingService.publicKey),
        await MintTransactionState.create(tokenId),
      ),
    );
  }
}
