import { MintTransaction } from './MintTransaction.js';
import { VerificationResult } from '../verification/VerificationResult.js';

/**
 * Mint transaction reason.
 */
export interface IMintTransactionReason {
  /**
   * Verify mint reason for genesis.
   *
   * @param genesis Genesis to verify against
   * @return verification result
   */
  verify(genesis: MintTransaction<IMintTransactionReason>): Promise<VerificationResult>;

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
