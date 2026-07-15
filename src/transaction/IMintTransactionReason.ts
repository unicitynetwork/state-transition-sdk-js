import { ReasonTypeId } from './ReasonTypeId.js';

/**
 * Mint transaction reason.
 * Verification is delegated to app-specific SDKs.
 */
export interface IMintTransactionReason {
  /**
   * Get the type identifier for this reason.
   *
   * @return reason type ID
   */
  getTypeId(): ReasonTypeId;

  /**
   * Convert mint transaction reason to CBOR bytes.
   *
   * @return CBOR representation of reason
   */
  toCBOR(): Uint8Array;

  /**
   * Convert mint transaction reason to JSON object.
   *
   * @return JSON representation of reason
   */
  toJSON(): unknown;
}
