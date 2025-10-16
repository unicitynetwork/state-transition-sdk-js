import { IMintTransactionReason } from './IMintTransactionReason.js';
import { IInclusionProofJson, InclusionProof } from './InclusionProof.js';
import { Transaction } from './Transaction.js';
import { ITransferTransactionDataJson, TransferTransactionData } from './TransferTransactionData.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { PredicateEngineService } from '../predicate/PredicateEngineService.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { Token } from '../token/Token.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationResultCode } from '../verification/VerificationResultCode.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';

export interface ITransferTransactionJson {
  readonly data: ITransferTransactionDataJson;
  readonly inclusionProof: IInclusionProofJson;
}

/**
 * Mint transaction.
 *
 * @param <R> mint reason
 */
export class TransferTransaction extends Transaction<TransferTransactionData> {
  public constructor(data: TransferTransactionData, inclusionProof: InclusionProof) {
    super(data, inclusionProof);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<TransferTransaction> {
    const data = CborDeserializer.readArray(bytes);

    return new TransferTransaction(await TransferTransactionData.fromCBOR(data[0]), InclusionProof.fromCBOR(data[1]));
  }

  public static isJSON(input: unknown): input is ITransferTransactionJson {
    return typeof input === 'object' && input !== null && 'data' in input && 'inclusionProof' in input;
  }

  public static async fromJSON(input: unknown): Promise<TransferTransaction> {
    if (!TransferTransaction.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new TransferTransaction(
      await TransferTransactionData.fromJSON(input.data),
      InclusionProof.fromJSON(input.inclusionProof),
    );
  }

  public async verify(
    trustBase: RootTrustBase,
    token: Token<IMintTransactionReason>,
  ): Promise<VerificationResult> {
    let result = await token.verifyNametagTokens(trustBase);
    if (!result.isSuccessful) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Nametag tokens verification failed', [result]);
    }

    result = await token.verifyRecipient();
    if (!result.isSuccessful) {
      return result;
    }

    result = await token.verifyRecipientData();
    if (!result.isSuccessful) {
      return result;
    }

    const predicate = await PredicateEngineService.createPredicate(token.state.predicate);
    if (!(await predicate.verify(trustBase, token, this))) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Predicate verification failed');
    }

    return new VerificationResult(VerificationResultCode.OK);
  }

  public toJSON(): ITransferTransactionJson {
    return {
      data: this.data.toJSON(),
      inclusionProof: this.inclusionProof.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.data.toCBOR(), this.inclusionProof.toCBOR());
  }
}
