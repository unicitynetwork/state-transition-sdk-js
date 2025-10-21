import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { IInclusionProofJson, InclusionProof } from '../transaction/InclusionProof.js';

/**
 * Inclusion proof response.
 */
export class InclusionProofResponse {
  /**
   * Create inclison proof response.
   *
   * @param inclusionProof inclusion proof
   */
  public constructor(public readonly inclusionProof: InclusionProof) {
    this.inclusionProof = inclusionProof;
  }

  public static isJSON(input: unknown): input is { inclusionProof: IInclusionProofJson } {
    return typeof input === 'object' && input !== null && 'inclusionProof' in input;
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

    return new InclusionProofResponse(InclusionProof.fromJSON(input.inclusionProof));
  }
}
