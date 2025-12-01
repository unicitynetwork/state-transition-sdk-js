import { IInclusionProofJson, InclusionProof, InclusionProofVerificationStatus } from './InclusionProof.js';
import { IMintTransactionDataJson, MintTransactionData } from './MintTransactionData.js';
import { MintTransactionState } from './MintTransactionState.js';
import { Transaction } from './Transaction.js';
import { StateId } from '../api/StateId.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { IMintReasonFactory } from './IMintReasonFactory.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { MintSigningService } from '../sign/MintSigningService.js';
import { HexConverter } from '../util/HexConverter.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationResultCode } from '../verification/VerificationResultCode.js';

export interface IMintTransactionJson {
  readonly data: IMintTransactionDataJson;
  readonly inclusionProof: IInclusionProofJson;
}

/**
 * Mint transaction.
 *
 * @param <R> mint reason
 */
export class MintTransaction extends Transaction<MintTransactionData> {
  public constructor(data: MintTransactionData, inclusionProof: InclusionProof) {
    super(data, inclusionProof);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<MintTransaction> {
    const data = CborDeserializer.readArray(bytes);

    return new MintTransaction(await MintTransactionData.fromCBOR(data[0]), InclusionProof.fromCBOR(data[1]));
  }

  public static isJSON(input: unknown): input is IMintTransactionJson {
    return typeof input === 'object' && input !== null && 'data' in input && 'inclusionProof' in input;
  }

  public static async fromJSON(input: unknown): Promise<MintTransaction> {
    if (!MintTransaction.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new MintTransaction(
      await MintTransactionData.fromJSON(input.data),
      InclusionProof.fromJSON(input.inclusionProof),
    );
  }

  /**
   * Verify mint transaction.
   * @param trustBase Root trust base for verification
   * @param mintReasonFactory Factory to create mint transaction reasons
   *
   * @return {VerificationResult} Verification result
   */
  public async verify(trustBase: RootTrustBase, mintReasonFactory: IMintReasonFactory): Promise<VerificationResult> {
    if (!this.inclusionProof.certificationData) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Missing certification data.');
    }

    if (!this.data.sourceState.equals(await MintTransactionState.create(this.data.tokenId))) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Invalid source state');
    }

    const signingService = await MintSigningService.create(this.data.tokenId);
    const certificationData = this.inclusionProof.certificationData;
    if (HexConverter.encode(certificationData.publicKey) !== HexConverter.encode(signingService.publicKey)) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Certification data public key mismatch.');
    }

    if (!(await certificationData.verify())) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Certification data verification failed.');
    }

    const reason = this.data._reason ? await mintReasonFactory.create(this.data._reason) : null;
    const reasonVerificationResult = (await reason?.verify(this)) ?? new VerificationResult(VerificationResultCode.OK);
    if (!reasonVerificationResult.isSuccessful) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Mint reason verification', [
        reasonVerificationResult,
      ]);
    }

    const inclusionProofVerificationResult = await this.inclusionProof.verify(
      trustBase,
      await StateId.create(signingService.publicKey, this.data.sourceState),
    );
    if (inclusionProofVerificationResult !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        VerificationResultCode.FAIL,
        `Inclusion proof verification failed with status ${inclusionProofVerificationResult}.`,
      );
    }

    return new VerificationResult(VerificationResultCode.OK);
  }

  /**
   * Convert mint transaction to JSON.
   * @return JSON representation of mint transaction
   */
  public toJSON(): IMintTransactionJson {
    return {
      data: this.data.toJSON(),
      inclusionProof: this.inclusionProof.toJSON(),
    };
  }

  /**
   * Convert mint transaction to CBOR.
   * @return CBOR representation of mint transaction
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.data.toCBOR(), this.inclusionProof.toCBOR());
  }
}
