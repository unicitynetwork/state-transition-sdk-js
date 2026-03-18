import { MintTransaction } from './MintTransaction.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { VerificationResult } from '../verification/VerificationResult.js';

/**
 * Mint transaction reason.
 */
export interface IMintTransactionReason {
  /**
   * Verify mint reason for genesis.
   *
   * @param trustBase Root trust base
   * @param genesis Genesis to verify against
   * @return verification result
   */
  verify(trustBase: RootTrustBase, genesis: MintTransaction<IMintTransactionReason>): Promise<VerificationResult>;

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
