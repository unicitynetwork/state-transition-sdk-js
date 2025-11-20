import { Commitment } from './Commitment.js';
import { IMintTransactionReason } from './IMintTransactionReason.js';
import { InclusionProof } from './InclusionProof.js';
import { TransferTransaction } from './TransferTransaction.js';
import { ITransferTransactionDataJson, TransferTransactionData } from './TransferTransactionData.js';
import { IAddress } from '../address/IAddress.js';
import { Authenticator, IAuthenticatorJson } from '../api/Authenticator.js';
import { RequestId } from '../api/RequestId.js';
import { DataHash } from '../hash/DataHash.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { SigningService } from '../sign/SigningService.js';
import { Token } from '../token/Token.js';

interface ITransferCommitmentJson {
  readonly requestId: string;
  readonly transactionData: ITransferTransactionDataJson;
  readonly authenticator: IAuthenticatorJson;
}

/**
 * Commitment representing a transfer transaction.
 */
export class TransferCommitment extends Commitment<TransferTransactionData> {
  private constructor(requestId: RequestId, transactionData: TransferTransactionData, authenticator: Authenticator) {
    super(requestId, transactionData, authenticator);
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

    const sourceStateHash = await transactionData.sourceState.calculateHash();
    const transactionHash = await transactionData.calculateHash();

    const requestId = await RequestId.create(signingService.publicKey, sourceStateHash);
    const authenticator = await Authenticator.create(signingService, transactionHash, sourceStateHash);

    return new TransferCommitment(requestId, transactionData, authenticator);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<TransferCommitment> {
    const data = CborDeserializer.readArray(bytes);

    return new TransferCommitment(
      RequestId.fromCBOR(data[0]),
      await TransferTransactionData.fromCBOR(data[1]),
      Authenticator.fromCBOR(data[2]),
    );
  }

  public static isJSON(input: unknown): input is ITransferCommitmentJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'requestId' in input &&
      'transactionData' in input &&
      'authenticator' in input
    );
  }

  public static async fromJSON(input: unknown): Promise<TransferCommitment> {
    if (!TransferCommitment.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new TransferCommitment(
      RequestId.fromJSON(input.requestId),
      await TransferTransactionData.fromJSON(input.transactionData),
      Authenticator.fromJSON(input.authenticator),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.requestId.toCBOR(),
      this.transactionData.toCBOR(),
      this.authenticator.toCBOR(),
    );
  }

  public toJSON(): ITransferCommitmentJson {
    return {
      authenticator: this.authenticator.toJSON(),
      requestId: this.requestId.toJSON(),
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
