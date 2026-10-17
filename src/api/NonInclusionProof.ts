import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { NonInclusionCertificate } from './NonInclusionCertificate.js';
import { StateId } from './StateId.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * Decoded `get_non_inclusion_proof.v1` material. **This is not evidence.** It claims that the state was absent at the
 * snapshot the embedded unicity certificate certifies; only `verifyNonInclusion`, against a trusted authority, turns it
 * into a `VerifiedAbsence`.
 *
 * Wire: `[blockNumber: uint64, 39034([1, certificate: bstr, unicityCertificate: native tagged CBOR value])]`. The state
 * id is never read from the wire: it is the one the caller asked for, bound here when the proof is decoded, and a proof
 * can only be verified for that state.
 */
export class NonInclusionProof {
  /** CBOR tag of the proof. */
  public static readonly CBOR_TAG = 39034n;

  /** Largest accepted wire encoding (certificate, certificate of the unicity chain and signatures), before decoding. */
  public static readonly MAX_WIRE_BYTES = 128 * 1024;

  /** Version of the proof encoding. */
  public static readonly VERSION = 1n;

  private constructor(
    public readonly stateId: StateId,
    public readonly unauthenticatedBlockNumber: bigint,
    private readonly _certificate: Uint8Array,
    private readonly _unicityCertificate: Uint8Array,
  ) {}

  /**
   * @returns {NonInclusionCertificate} The decoded certificate.
   */
  public get certificate(): NonInclusionCertificate {
    return NonInclusionCertificate.fromBytes(this._certificate);
  }

  /**
   * @returns {UnicityCertificate} A fresh decoding of the embedded unicity certificate (untrusted until verified).
   */
  public get unicityCertificate(): UnicityCertificate {
    return UnicityCertificate.fromCBOR(this._unicityCertificate);
  }

  /**
   * Decode the result of `get_non_inclusion_proof.v1` for a state that was asked about, completely and strictly: no
   * trailing bytes, shortest integers, the certificate as a byte string, the unicity certificate as an embedded value
   * with exactly its canonical encoding, certificate within its size bound.
   *
   * @param {StateId} stateId The state the request was for.
   * @param {Uint8Array} bytes Wire bytes (copied).
   * @returns {NonInclusionProof} Decoded, unverified proof.
   * @throws {CborError|RangeError} If the bytes are not the profile.
   */
  public static decode(stateId: StateId, bytes: Uint8Array): NonInclusionProof {
    if (bytes.length > NonInclusionProof.MAX_WIRE_BYTES) {
      throw new RangeError(`Non-inclusion proof exceeds ${NonInclusionProof.MAX_WIRE_BYTES} bytes.`);
    }
    const outer = CborDeserializer.decodeArray(bytes, 2);
    const blockNumber = CborDeserializer.decodeUnsignedInteger(outer[0]);
    const tag = CborDeserializer.decodeTag(outer[1]);
    if (tag.tag !== NonInclusionProof.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for NonInclusionProof: ${tag.tag}`);
    }
    const body = CborDeserializer.decodeArray(tag.data, 3);
    const version = CborDeserializer.decodeUnsignedInteger(body[0]);
    if (version !== NonInclusionProof.VERSION) {
      throw new CborError(`Unsupported NonInclusionProof version: ${version}`);
    }
    const certificate = CborDeserializer.decodeByteString(body[1]);
    // validates length against its bitmap before anything is derived from it
    NonInclusionCertificate.fromBytes(certificate);

    const uc = UnicityCertificate.fromCBOR(body[2]);
    if (!areUint8ArraysEqual(uc.toCBOR(), body[2])) {
      throw new CborError('The unicity certificate is not in its canonical encoding.');
    }
    return new NonInclusionProof(stateId, blockNumber, new Uint8Array(certificate), new Uint8Array(body[2]));
  }

  /**
   * @returns {Uint8Array} Wire bytes of the proof, byte for byte what was decoded.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.unauthenticatedBlockNumber),
      CborSerializer.encodeTag(
        NonInclusionProof.CBOR_TAG,
        CborSerializer.encodeArray(
          CborSerializer.encodeUnsignedInteger(NonInclusionProof.VERSION),
          CborSerializer.encodeByteString(this._certificate),
          this._unicityCertificate,
        ),
      ),
    );
  }
}
