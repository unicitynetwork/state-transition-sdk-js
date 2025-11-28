import { Commitment } from './Commitment.js';
import { InclusionProof } from './InclusionProof.js';
import { MintTransaction } from './MintTransaction.js';
import { MintTransactionData } from './MintTransactionData.js';
import { CertificationData } from '../api/CertificationData.js';
import { MintSigningService } from '../sign/MintSigningService.js';

/**
 * Commitment representing a submitted transaction.
 * @typeParam R The type of the mint transaction reason.
 */
export class MintCommitment extends Commitment<MintTransactionData> {
  private constructor(data: MintTransactionData, certificationData: CertificationData) {
    super(data, certificationData);
  }

  /**
   * Create mint commitment from transaction data.
   *
   * @param {MintTransactionData} transactionData mint transaction data
   * @return mint commitment
   */
  public static async create(transactionData: MintTransactionData): Promise<MintCommitment> {
    const signingService = await MintSigningService.create(transactionData.tokenId);

    const transactionHash = await transactionData.calculateHash();
    const certificationData = await CertificationData.create(
      transactionData.sourceState,
      transactionHash,
      signingService,
    );

    return new MintCommitment(transactionData, certificationData);
  }

  /**
   * Create mint transaction from commitment.
   *
   * @param {InclusionProof} inclusionProof Commitment inclusion proof
   * @return mint transaction
   */
  public toTransaction(inclusionProof: InclusionProof): MintTransaction {
    return new MintTransaction(this.transactionData, inclusionProof);
  }
}
