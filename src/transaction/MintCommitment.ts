import { Commitment } from './Commitment.js';
import { IMintTransactionReason } from './IMintTransactionReason.js';
import { InclusionProof } from './InclusionProof.js';
import { MintTransaction } from './MintTransaction.js';
import { MintTransactionData } from './MintTransactionData.js';
import { Authenticator } from '../api/Authenticator.js';
import { RequestId } from '../api/RequestId.js';
import { MintSigningService } from '../sign/MintSigningService.js';

/**
 * Commitment representing a submitted transaction.
 * @typeParam R The type of the mint transaction reason.
 */
export class MintCommitment<R extends IMintTransactionReason> extends Commitment<MintTransactionData<R>> {
  private constructor(requestId: RequestId, transactionData: MintTransactionData<R>, authenticator: Authenticator) {
    super(requestId, transactionData, authenticator);
  }

  /**
   * Create mint commitment from transaction data.
   *
   * @param {MintTransactionData<R>} data mint transaction data
   * @return mint commitment
   */
  public static async create<R extends IMintTransactionReason>(
    data: MintTransactionData<R>,
  ): Promise<MintCommitment<R>> {
    const signingService = await MintSigningService.create(data.tokenId);

    const transactionHash = await data.calculateHash();

    const requestId = await RequestId.create(signingService.publicKey, data.sourceState);
    const authenticator = await Authenticator.create(signingService, transactionHash, data.sourceState);

    return new MintCommitment(requestId, data, authenticator);
  }

  /**
   * Create mint transaction from commitment.
   *
   * @param {InclusionProof} inclusionProof Commitment inclusion proof
   * @return mint transaction
   */
  public toTransaction(inclusionProof: InclusionProof): MintTransaction<R> {
    return new MintTransaction<R>(this.transactionData, inclusionProof);
  }
}
