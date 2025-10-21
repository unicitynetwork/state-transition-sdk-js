import { DataHash } from '../../hash/DataHash.js';
import { IVerificationContext } from '../../verification/IVerificationContext.js';
import { RootTrustBase } from '../RootTrustBase.js';
import { UnicityCertificate } from '../UnicityCertificate.js';

/**
 * Unicity certificate verification context.
 */
export class UnicityCertificateVerificationContext implements IVerificationContext {
  /**
   * Create unicity certificate verification context.
   *
   * @param {DataHash} inputHash          input record hash
   * @param {UnicityCertificate} unicityCertificate unicity certificate
   * @param {RootTrustBase} trustBase          root trust base
   */
  public constructor(
    public readonly inputHash: DataHash,
    public readonly unicityCertificate: UnicityCertificate,
    public readonly trustBase: RootTrustBase,
  ) {}
}
