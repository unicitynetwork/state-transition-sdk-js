import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { IMintJustificationVerifier } from './IMintJustificationVerifier.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

export class MintJustificationVerifierService {
  private readonly verifiers: Map<bigint, IMintJustificationVerifier> = new Map();

  public register(verifier: IMintJustificationVerifier): this {
    if (this.verifiers.has(verifier.tag)) {
      throw new Error(`Duplicate mint justification verifier for tag ${verifier.tag}.`);
    }

    this.verifiers.set(verifier.tag, verifier);
    return this;
  }

  public async verify(transaction: CertifiedMintTransaction): Promise<VerificationResult<VerificationStatus>> {
    const bytes = transaction.justification;
    if (!bytes) {
      return new VerificationResult('MintJustificationVerification', VerificationStatus.OK);
    }

    const tag = CborDeserializer.decodeTag(bytes).tag;
    const verifier = this.verifiers.get(tag);
    if (!verifier) {
      return new VerificationResult(
        'MintJustificationVerification',
        VerificationStatus.FAIL,
        `Unsupported mint justification tag: ${tag}.`,
      );
    }

    const result = await verifier.verify(transaction, this);
    return new VerificationResult('MintJustificationVerification', result.status, '', [result]);
  }
}
