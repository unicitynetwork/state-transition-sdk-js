import { Commitment } from './Commitment.js';
import { InclusionProof } from './InclusionProof.js';
import { TransferTransaction } from './TransferTransaction.js';
import { ITransferTransactionDataJson, TransferTransactionData } from './TransferTransactionData.js';
import { IAddress } from '../address/IAddress.js';
import { CertificationData, ICertificationDataJson } from '../api/CertificationData.js';
import { DataHash } from '../hash/DataHash.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { SigningService } from '../sign/SigningService.js';
import { Token } from '../token/Token.js';

interface ITransferCommitmentJson {
  readonly transactionData: ITransferTransactionDataJson;
  readonly certificationData: ICertificationDataJson;
}

/**
 * Commitment representing a transfer transaction.
 */
export class TransferCommitment extends Commitment<TransferTransactionData> {
  private constructor(transactionData: TransferTransactionData, certificationData: CertificationData) {
    super(transactionData, certificationData);
  }

  /**
   * Create transfer commitment.
   *
   * @param token             current token
   * @param recipient         recipient of token
   * @param salt              transaction salt
   * @param recipientDataHash recipient data hash
   * @param message           transaction message
   * @param signingService    signing service to unlock token
   * @return transfer commitment
   */
  public static async create(
    token: Token,
    recipient: IAddress,
    salt: Uint8Array,
    recipientDataHash: DataHash | null,
    message: Uint8Array | null,
    signingService: SigningService,
  ): Promise<TransferCommitment> {
    const transactionData = TransferTransactionData.create(
      token.state,
      recipient,
      salt,
      recipientDataHash,
      message,
      token.nametagTokens,
    );

    const certificationData = await CertificationData.create(
      await transactionData.sourceState.calculateHash(),
      await transactionData.calculateHash(),
      signingService,
    );

    return new TransferCommitment(transactionData, certificationData);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<TransferCommitment> {
    const data = CborDeserializer.readArray(bytes);

    return new TransferCommitment(await TransferTransactionData.fromCBOR(data[0]), CertificationData.fromCBOR(data[1]));
  }

  public static isJSON(input: unknown): input is ITransferCommitmentJson {
    return typeof input === 'object' && input !== null && 'transactionData' in input && 'certificationData' in input;
  }

  public static async fromJSON(input: unknown): Promise<TransferCommitment> {
    if (!TransferCommitment.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new TransferCommitment(
      await TransferTransactionData.fromJSON(input.transactionData),
      CertificationData.fromJSON(input.certificationData),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.transactionData.toCBOR(), this.certificationData.toCBOR());
  }

  public toJSON(): ITransferCommitmentJson {
    return {
      certificationData: this.certificationData.toJSON(),
      transactionData: this.transactionData.toJSON(),
    };
  }

  /**
   * Create transfer transaction from transfer commitment.
   *
   * @param inclusionProof Commitment inclusion proof
   * @return transfer transaction
   */
  public toTransaction(inclusionProof: InclusionProof): TransferTransaction {
    return new TransferTransaction(this.transactionData, inclusionProof);
  }
}
