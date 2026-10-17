import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { UnicityCertificateInterner } from './bft/UnicityCertificateInterner.js';
import { CertificationData } from './CertificationData.js';
import { InclusionCertificate } from './InclusionCertificate.js';
import { InclusionProof } from './InclusionProof.js';
import { ProofStatusHint } from './ProofStatusHint.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * What the aggregator answers when asked about a state.
 *
 * This is the wire shape, and it has two forms: a certified leaf, or the absence of one. Keeping
 * that distinction here rather than inside {@link InclusionProof} is what lets the proof itself be
 * complete by construction — a verifier that holds one never has to ask whether it describes a
 * leaf.
 */
export class InclusionProofResponse {
  private constructor(
    public readonly blockNumber: bigint,
    public readonly inclusionProof: InclusionProof | null,
    public readonly unicityCertificate: UnicityCertificate,
    private readonly _statusHint: ProofStatusHint | null = null,
    private readonly _waitedMs: number | null = null,
  ) {}

  /**
   * The aggregator's **unauthenticated hint**, present only when the request asked for it (`includeStatusHint`) and the
   * aggregator answered with a recognized one; `null` is the legacy behavior. It is not a verdict and not evidence: it
   * is not part of the proof, never changes how a proof is verified, can accompany a missing proof (`included`
   * without one), and `unknown` or `expired` is not a proof of absence.
   *
   * @returns {ProofStatusHint|null} Hint, or `null`.
   */
  public get statusHint(): ProofStatusHint | null {
    return this._statusHint;
  }

  /**
   * The aggregator's **unauthenticated echo** of the time it held the request (`waitMs`), in milliseconds: present only
   * when the request asked for a wait and the aggregator echoed it; `null` is the legacy behavior. `0` means it did not
   * wait. It is timing metadata, not evidence: not part of the proof, not encoded by {@link toCBOR}, and no
   * promise that a particular duration was honored. A missing echo says nothing about the aggregator's capability.
   *
   * @returns {number|null} Milliseconds, or `null`.
   */
  public get waitedMs(): number | null {
    return this._waitedMs;
  }

  /**
   * The aggregator has certified this state.
   *
   * The round it was served against is the proof's own, so there is no second certificate to
   * supply and none that could disagree with it.
   *
   * @param {bigint} blockNumber Block number the answer was served at.
   * @param {InclusionProof} inclusionProof The certified leaf.
   * @returns {InclusionProofResponse} The response.
   */
  public static certified(blockNumber: bigint, inclusionProof: InclusionProof): InclusionProofResponse {
    return new InclusionProofResponse(blockNumber, inclusionProof, inclusionProof.unicityCertificate);
  }

  /**
   * Create response from CBOR bytes within a decoding operation sharing identical wire certificates.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @param {UnicityCertificateInterner} [interner] Decoding operation, or none to parse every certificate.
   * @returns {InclusionProofResponse} Inclusion proof response.
   */
  public static decodeWith(bytes: Uint8Array, interner?: UnicityCertificateInterner): InclusionProofResponse {
    const data = CborDeserializer.decodeArray(bytes, 2);
    const blockNumber = CborDeserializer.decodeUnsignedInteger(data[0]);

    const tag = CborDeserializer.decodeTag(data[1]);
    if (tag.tag !== InclusionProof.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for InclusionProof: ${tag.tag}`);
    }
    const proof = CborDeserializer.decodeArray(tag.data, 5);
    const version = CborDeserializer.decodeUnsignedInteger(proof[0]);
    if (version !== InclusionProof.VERSION) {
      throw new CborError(`Unsupported InclusionProof version: ${version}`);
    }

    const certificationData = CborDeserializer.decodeNullable(proof[1], CertificationData.fromCBOR);
    const referenceTime = CborDeserializer.decodeNullable(proof[2], CborDeserializer.decodeUnsignedInteger);
    const inclusionCertificate = CborDeserializer.decodeNullable(proof[3], (certificate) =>
      InclusionCertificate.decode(CborDeserializer.decodeByteString(certificate)),
    );
    const unicityCertificate = UnicityCertificate.decodeWith(proof[4], interner);

    // The three leaf fields travel together: all present once the request has been included in a
    // certified round, all absent while it is still pending. Anything in between is a protocol
    // violation, and rejecting it here is what lets InclusionProof require all three.
    const present = [certificationData, referenceTime, inclusionCertificate].filter((field) => field != null).length;
    if (present === 0) {
      return InclusionProofResponse.notCertified(blockNumber, unicityCertificate);
    }
    if (present !== 3) {
      throw new CborError(
        'InclusionProof must carry certification data, reference time and inclusion certificate together, or none of them.',
      );
    }

    return InclusionProofResponse.certified(
      blockNumber,
      new InclusionProof(
        certificationData as CertificationData,
        referenceTime as bigint,
        inclusionCertificate as InclusionCertificate,
        unicityCertificate,
      ),
    );
  }

  /**
   * Create response from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {InclusionProofResponse} Inclusion proof response.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProofResponse {
    return InclusionProofResponse.decodeWith(bytes);
  }

  /**
   * The aggregator has not certified this state yet, so only the round is meaningful.
   *
   * @param {bigint} blockNumber Block number the answer was served at.
   * @param {UnicityCertificate} unicityCertificate Certificate of the round the answer was served against.
   * @returns {InclusionProofResponse} The response.
   */
  public static notCertified(blockNumber: bigint, unicityCertificate: UnicityCertificate): InclusionProofResponse {
    return new InclusionProofResponse(blockNumber, null, unicityCertificate);
  }

  /**
   * Convert InclusionProofResponse to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.blockNumber),
      this.inclusionProof?.toCBOR() ?? this.encodeNoCertifiedLeaf(),
    );
  }

  /**
   * The same response with the aggregator's (unauthenticated) hint attached. The hint is not encoded by {@link toCBOR}.
   *
   * @param {ProofStatusHint|null} hint Hint, `null` for none.
   * @returns {InclusionProofResponse} New response.
   */
  public withStatusHint(hint: ProofStatusHint | null): InclusionProofResponse {
    return new InclusionProofResponse(
      this.blockNumber,
      this.inclusionProof,
      this.unicityCertificate,
      hint,
      this._waitedMs,
    );
  }

  /**
   * The same response with the aggregator's (unauthenticated) wait echo attached. It is not encoded by {@link toCBOR}.
   *
   * @param {number|null} waitedMs Milliseconds waited, `null` for no echo.
   * @returns {InclusionProofResponse} New response.
   */
  public withWaitedMs(waitedMs: number | null): InclusionProofResponse {
    return new InclusionProofResponse(
      this.blockNumber,
      this.inclusionProof,
      this.unicityCertificate,
      this._statusHint,
      waitedMs,
    );
  }

  /**
   * Encode the wire form for a state with no certified leaf: the three leaf fields absent, the
   * round's certificate still present.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  private encodeNoCertifiedLeaf(): Uint8Array {
    return CborSerializer.encodeTag(
      InclusionProof.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(InclusionProof.VERSION),
        CborSerializer.encodeNull(),
        CborSerializer.encodeNull(),
        CborSerializer.encodeNull(),
        this.unicityCertificate.toCBOR(),
      ),
    );
  }
}
