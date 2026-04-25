import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { MintTransaction } from '../MintTransaction.js';
import { IMintJustificationVerifier } from './IMintJustificationVerifier.js';

export class MintJustificationVerifierService {
  private readonly verifiers: Map<bigint, IMintJustificationVerifier> = new Map();

  public register(verifier: IMintJustificationVerifier): this {
    if (this.verifiers.has(verifier.tag)) {
      throw new Error(`Duplicate mint justification verifier for tag ${verifier.tag}.`);
    }

    this.verifiers.set(verifier.tag, verifier);
    return this;
  }

  public verify(
    transaction: MintTransaction | CertifiedMintTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const bytes = transaction.justification;
    if (!bytes) {
      return Promise.resolve(new VerificationResult('MintJustificationVerifierService', VerificationStatus.OK));
    }

    const tag = CborDeserializer.decodeTag(bytes).tag;
    const verifier = this.verifiers.get(tag);
    if (!verifier) {
      throw new Error(`Unsupported mint justification tag: ${tag}.`);
    }

    return verifier.verify(transaction);
  }
}
