import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { IInclusionProofJson, InclusionProof } from './InclusionProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

interface IInclusionProofResponseJson {
  readonly blockNumber: string;
  readonly inclusionProof: IInclusionProofJson;
}

/**
 * Inclusion proof response.
 */
export class InclusionProofResponse {
  /**
   * Create inclusion proof response.
   *
   * @param inclusionProof inclusion proof
   * @param blockNumber block number
   */
  public constructor(
    public readonly blockNumber: bigint,
    public readonly inclusionProof: InclusionProof,
  ) {
    this.inclusionProof = inclusionProof;
  }

  /**
   * Create response from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return inclusion proof response
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProofResponse {
    const data = CborDeserializer.decodeArray(bytes);
    return new InclusionProofResponse(
      CborDeserializer.decodeUnsignedInteger(data[0]),
      InclusionProof.fromCBOR(data[1]),
    );
  }

  /**
   * Create response from JSON string.
   *
   * @param input JSON string
   * @return inclusion proof response
   */
  public static fromJSON(input: unknown): InclusionProofResponse {
    if (!InclusionProofResponse.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new InclusionProofResponse(BigInt(input.blockNumber), InclusionProof.fromJSON(input.inclusionProof));
  }

  public static isJSON(input: unknown): input is IInclusionProofResponseJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'inclusionProof' in input &&
      'blockNumber' in input &&
      typeof input.blockNumber === 'string'
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.blockNumber),
      this.inclusionProof.toCBOR(),
    );
  }

  public toJSON(): IInclusionProofResponseJson {
    return {
      blockNumber: this.blockNumber.toString(),
      inclusionProof: this.inclusionProof.toJSON(),
    };
  }
}
