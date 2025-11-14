import { IMintTransactionReason } from './IMintTransactionReason.js';
import { IInclusionProofJson, InclusionProof, InclusionProofVerificationStatus } from './InclusionProof.js';
import { IMintTransactionDataJson, MintTransactionData } from './MintTransactionData.js';
import { MintTransactionState } from './MintTransactionState.js';
import { Transaction } from './Transaction.js';
import { RequestId } from '../api/RequestId.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
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
export class MintTransaction<R extends IMintTransactionReason> extends Transaction<MintTransactionData<R>> {
  public constructor(data: MintTransactionData<R>, inclusionProof: InclusionProof) {
    super(data, inclusionProof);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<MintTransaction<IMintTransactionReason>> {
    const data = CborDeserializer.readArray(bytes);

    return new MintTransaction(await MintTransactionData.fromCBOR(data[0]), InclusionProof.fromCBOR(data[1]));
  }

  public static isJSON(input: unknown): input is IMintTransactionJson {
    return typeof input === 'object' && input !== null && 'data' in input && 'inclusionProof' in input;
  }

  public static async /**/ fromJSON(input: unknown): Promise<MintTransaction<IMintTransactionReason>> {
    if (!MintTransaction.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new MintTransaction(
      await MintTransactionData.fromJSON(input.data),
      InclusionProof.fromJSON(input.inclusionProof),
    );
  }

  public async verify(trustBase: RootTrustBase): Promise<VerificationResult> {
    if (!this.inclusionProof.authenticator) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Missing authenticator.');
    }

    if (!this.inclusionProof.transactionHash) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Missing transaction hash.');
    }

    if (!this.data.sourceState.equals(await MintTransactionState.create(this.data.tokenId))) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Invalid source state');
    }

    const signingService = await MintSigningService.create(this.data.tokenId);
    if (
      HexConverter.encode(this.inclusionProof.authenticator.publicKey) !== HexConverter.encode(signingService.publicKey)
    ) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Authenticator public key mismatch.');
    }

    if (!(await this.inclusionProof.authenticator.verify(this.inclusionProof.transactionHash))) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Authenticator verification failed.');
    }

    const reasonVerificationResult =
      (await this.data.reason?.verify(this)) ?? new VerificationResult(VerificationResultCode.OK);
    if (!reasonVerificationResult.isSuccessful) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Mint reason verification', [
        reasonVerificationResult,
      ]);
    }

    const inclusionProofVerificationResult = await this.inclusionProof.verify(
      trustBase,
      await RequestId.create(signingService.publicKey, this.data.sourceState),
    );
    if (inclusionProofVerificationResult !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Inclusion proof verification failed.');
    }

    return new VerificationResult(VerificationResultCode.OK);
  }

  public toJSON(): IMintTransactionJson {
    return {
      data: this.data.toJSON(),
      inclusionProof: this.inclusionProof.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.data.toCBOR(), this.inclusionProof.toCBOR());
  }
}
