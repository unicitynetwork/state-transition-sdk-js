import { InclusionProof } from './InclusionProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

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

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.blockNumber),
      this.inclusionProof.toCBOR(),
    );
  }
}
