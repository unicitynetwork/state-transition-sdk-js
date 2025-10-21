import { Commitment } from './Commitment.js';
import { IMintTransactionReason } from './IMintTransactionReason.js';
import { InclusionProof } from './InclusionProof.js';
import { MintTransaction } from './MintTransaction.js';
import { MintTransactionData } from './MintTransactionData.js';
import { Authenticator } from '../api/Authenticator.js';
import { RequestId } from '../api/RequestId.js';
import { SigningService } from '../sign/SigningService.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Commitment representing a submitted transaction.
 * @typeParam R The type of the mint transaction reason.
 */
export class MintCommitment<R extends IMintTransactionReason> extends Commitment<MintTransactionData<R>> {
  public static readonly MINTER_SECRET = HexConverter.decode('495f414d5f554e4956455253414c5f4d494e5445525f464f525f');

  private constructor(requestId: RequestId, transactionData: MintTransactionData<R>, authenticator: Authenticator) {
    super(requestId, transactionData, authenticator);
  }

  /**
   * Create mint commitment from transaction data.
   *
   * @param {MintTransactionData<R>} transactionData mint transaction data
   * @return mint commitment
   */
  public static async create<R extends IMintTransactionReason>(
    transactionData: MintTransactionData<R>,
  ): Promise<MintCommitment<R>> {
    const signingService = await MintCommitment.createSigningService(transactionData);

    const transactionHash = await transactionData.calculateHash();

    const requestId = await RequestId.create(signingService.publicKey, transactionData.sourceState);
    const authenticator = await Authenticator.create(signingService, transactionHash, transactionData.sourceState);

    return new MintCommitment(requestId, transactionData, authenticator);
  }

  /**
   * Create signing service for initial mint.
   *
   * @param {MintTransactionData<IMintTransactionReason>} transactionData mint transaction data
   * @return signing service
   */
  public static createSigningService(
    transactionData: MintTransactionData<IMintTransactionReason>,
  ): Promise<SigningService> {
    return SigningService.createFromSecret(MintCommitment.MINTER_SECRET, transactionData.tokenId.bytes);
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
