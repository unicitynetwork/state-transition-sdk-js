import { secp256k1 } from '@noble/curves/secp256k1.js';

import {
  TrustBaseChainError,
  TrustBaseEncodingError,
  TrustBaseInvalidError,
  TrustBaseSignatureError,
} from './TrustBaseError.js';
import { DataHasher } from '../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { Secp256k1SignatureVerifier } from '../../../crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { Signature } from '../../../crypto/secp256k1/Signature.js';
import { CborDeserializer } from '../../../serialization/cbor/CborDeserializer.js';
import { CborMap } from '../../../serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../../serialization/cbor/CborMapEntry.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { NetworkId } from '../../NetworkId.js';

const UTF8_ENCODER = new TextEncoder();

/**
 * One member of a trust-base epoch: its node id, compressed secp256k1 signing key and voting weight.
 */
export class TrustBaseMember {
  private readonly _sigKey: Uint8Array;

  public constructor(
    public readonly nodeId: string,
    sigKey: Uint8Array,
    public readonly weight: bigint,
  ) {
    this._sigKey = new Uint8Array(sigKey);
  }

  /** @returns {Uint8Array} Copy of the 33-byte compressed signing key. */
  public get sigKey(): Uint8Array {
    return new Uint8Array(this._sigKey);
  }
}

/**
 * Signed Unicity Trust Base entry, record version 2 (CBOR tag 39000), the reference being bft-go-base `types.RootTrustBaseV2`.
 *
 * Wire form: tag 39000 over the 10-element array
 * `[2, networkId, epoch, epochStartRound, [[nodeId, sigKey, weight]...], quorumThreshold, stateHash|null, changeRecordHash|null,
 * previousEntryId, {nodeId: signature}|null]`.
 *
 * Decoding is strict and has exactly one byte form per entry: exact tag, version and arity, bounded sizes, no trailing bytes, an absent hash is
 * null (never an empty byte string), and the input must equal the deterministic encoding of what was decoded. The entry's identity is
 * `entryId = SHA-256(sigBytes)` where sigBytes is the entry with the signature field encoded as CBOR null, so two valid signature sets over
 * the same entry give the same identity. This class checks structure only; signatures are verified by the history that appends the entry.
 */
export class RootTrustBaseV2 {
  public static readonly CBOR_TAG = 39000n;
  /** Length of an entry id and of the hashes when present. */
  public static readonly ID_LENGTH = 32;
  /** Slack over the member bound for array and map element counts, as in the reference decoder (MAX_MEMBERS + 16). */
  public static readonly MAX_ELEMENTS = 272;
  /** Allocation bound while decoding; deployments admit far fewer. */
  public static readonly MAX_MEMBERS = 256;
  public static readonly MAX_NODE_ID_BYTES = 128;
  /** One member's weight bound, so that the sum over MAX_MEMBERS cannot overflow 64 bits. */
  public static readonly MAX_WEIGHT = 1n << 40n;
  /** Length of a compressed secp256k1 signing key. */
  public static readonly SIGNING_KEY_LENGTH = 33;
  public static readonly VERSION = 2n;

  private static readonly SIGNATURE_VERIFIER = new Secp256k1SignatureVerifier();

  private constructor(
    private readonly _network: number,
    public readonly epoch: bigint,
    public readonly epochStartRound: bigint,
    private readonly _members: TrustBaseMember[],
    public readonly quorumThreshold: bigint,
    private readonly _stateHash: Uint8Array | null,
    private readonly _changeRecordHash: Uint8Array | null,
    private readonly _previousEntryId: Uint8Array,
    private readonly _signatures: Map<string, Uint8Array> | null,
  ) {}

  /** @returns {Uint8Array|null} Copy of the change record hash, or null when absent. */
  public get changeRecordHash(): Uint8Array | null {
    return this._changeRecordHash ? new Uint8Array(this._changeRecordHash) : null;
  }

  /** @returns {TrustBaseMember[]} The members, sorted by node id bytes. */
  public get members(): TrustBaseMember[] {
    return [...this._members];
  }

  /** @returns {NetworkId} The network of the entry (1..65535 on any entry that passed {@link validate}). */
  public get networkId(): NetworkId {
    return NetworkId.fromId(this._network);
  }

  /** @returns {Uint8Array} Copy of the predecessor's entry id; 32 zero bytes for the genesis entry. */
  public get previousEntryId(): Uint8Array {
    return new Uint8Array(this._previousEntryId);
  }

  /** @returns {Map<string, Uint8Array>|null} Copy of the predecessor members' signatures over sigBytes, null for the genesis entry. */
  public get signatures(): Map<string, Uint8Array> | null {
    return this._signatures
      ? new Map(Array.from(this._signatures.entries()).map(([id, signature]) => [id, new Uint8Array(signature)]))
      : null;
  }

  /** @returns {Uint8Array|null} Copy of the state hash, or null when absent. */
  public get stateHash(): Uint8Array | null {
    return this._stateHash ? new Uint8Array(this._stateHash) : null;
  }

  /** @returns {bigint} Total voting weight of the members. */
  public get totalWeight(): bigint {
    return this._members.reduce((total, member) => total + member.weight, 0n);
  }

  /**
   * Decode and structurally validate a tagged version-2 entry.
   *
   * @param {Uint8Array} bytes Tagged entry.
   * @returns {RootTrustBaseV2} Decoded entry.
   * @throws {TrustBaseEncodingError} If the bytes are not the deterministic encoding of a version-2 entry.
   * @throws {TrustBaseInvalidError} If a structure rule fails.
   */
  public static decode(bytes: Uint8Array): RootTrustBaseV2 {
    let entry: RootTrustBaseV2;
    try {
      entry = RootTrustBaseV2.parse(bytes);
    } catch (error) {
      if (error instanceof TrustBaseEncodingError) {
        throw error;
      }
      throw new TrustBaseEncodingError(error instanceof Error ? error.message : String(error));
    }

    // One byte form per entry: the input must be what this decoder would write back.
    if (!areUint8ArraysEqual(entry.encode(), bytes)) {
      throw new TrustBaseEncodingError('Not the deterministic encoding.');
    }

    entry.validate();
    return entry;
  }

  private static parse(bytes: Uint8Array): RootTrustBaseV2 {
    const tagged = CborDeserializer.decodeTag(bytes);
    if (tagged.tag !== RootTrustBaseV2.CBOR_TAG) {
      throw new TrustBaseEncodingError(`Tag ${tagged.tag}, expected ${RootTrustBaseV2.CBOR_TAG}.`);
    }

    const fields = CborDeserializer.decodeArray(tagged.data);
    if (fields.length !== 10) {
      throw new TrustBaseEncodingError(`Expected 10 fields, got ${fields.length}.`);
    }

    const uint64 = (data: Uint8Array): bigint => {
      return CborDeserializer.decodeUnsignedInteger(data);
    };
    // An absent hash is null, never an empty byte string: that would be a second byte form (and a second entry id) of the same entry.
    const hash = (data: Uint8Array): Uint8Array | null =>
      CborDeserializer.decodeNullable(data, (item) => {
        const value = CborDeserializer.decodeByteString(item);
        if (value.length === 0) {
          throw new TrustBaseEncodingError('An absent hash is null, not an empty byte string.');
        }
        return value;
      });

    const version = uint64(fields[0]);
    if (version !== RootTrustBaseV2.VERSION) {
      throw new TrustBaseEncodingError(`Version ${version}, expected ${RootTrustBaseV2.VERSION}.`);
    }

    const network = uint64(fields[1]);
    // 0 fits the wire type and is a structure error (validate), as in the Go and Rust references; only a value above 16 bits is a bad encoding.
    if (network > 0xffffn) {
      throw new TrustBaseEncodingError(`Network identifier ${network} above 65535.`);
    }

    const memberItems = CborDeserializer.decodeArray(fields[4]);
    if (memberItems.length > RootTrustBaseV2.MAX_ELEMENTS) {
      throw new TrustBaseEncodingError(`${memberItems.length} members exceed the decoding bound.`);
    }
    const members = memberItems.map((item) => {
      const member = CborDeserializer.decodeArray(item, 3);
      return new TrustBaseMember(
        CborDeserializer.decodeTextString(member[0]),
        CborDeserializer.decodeByteString(member[1]),
        uint64(member[2]),
      );
    });

    let signatures: Map<string, Uint8Array> | null = null;
    const signatureEntries = CborDeserializer.decodeNullable(fields[9], (item) => CborDeserializer.decodeMap(item));
    if (signatureEntries !== null) {
      if (signatureEntries.length > RootTrustBaseV2.MAX_ELEMENTS) {
        throw new TrustBaseEncodingError(`${signatureEntries.length} signatures exceed the decoding bound.`);
      }
      signatures = new Map();
      for (const entry of signatureEntries) {
        signatures.set(CborDeserializer.decodeTextString(entry.key), CborDeserializer.decodeByteString(entry.value));
      }
    }

    return new RootTrustBaseV2(
      Number(network),
      uint64(fields[2]),
      uint64(fields[3]),
      members,
      uint64(fields[5]),
      hash(fields[6]),
      hash(fields[7]),
      CborDeserializer.decodeByteString(fields[8]),
      signatures,
    );
  }

  /**
   * @returns {Uint8Array} The tagged deterministic encoding.
   */
  public encode(): Uint8Array {
    return this.encodeWithSignatures(this._signatures);
  }

  /**
   * @returns {Promise<Uint8Array>} The entry id, SHA-256 of sigBytes: independent of the signatures, what a successor links to and a pin names.
   */
  public async entryId(): Promise<Uint8Array> {
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(this.sigBytes()).digest();
    return hash.data;
  }

  /** @returns {boolean} Whether the entry has no predecessor (32 zero bytes). */
  public isGenesis(): boolean {
    return this._previousEntryId.every((byte) => byte === 0);
  }

  /**
   * @returns {Uint8Array} The bytes the predecessor's members sign: the entry with the signature field encoded as CBOR null.
   */
  public sigBytes(): Uint8Array {
    return this.encodeWithSignatures(null);
  }

  /**
   * Check the entry's structure, not its signatures: epoch at least 1, the member list (sorted by node id bytes, unique, valid compressed
   * keys, positive bounded weights, bounded count), the exact quorum threshold, hash lengths, and the genesis (zero predecessor, null
   * signatures) versus non-genesis (32-byte predecessor, non-empty signature map) shape.
   *
   * @throws {TrustBaseInvalidError} If a rule fails.
   */
  public validate(): void {
    if (this._network === 0) {
      throw new TrustBaseInvalidError('Network identifier is zero.');
    }
    if (this.epoch === 0n) {
      throw new TrustBaseInvalidError('Epoch is zero.');
    }

    const count = this._members.length;
    if (count === 0 || count > RootTrustBaseV2.MAX_MEMBERS) {
      throw new TrustBaseInvalidError(`${count} members (1..${RootTrustBaseV2.MAX_MEMBERS}).`);
    }

    let total = 0n;
    const keys = new Map<string, string>();
    let previousId: Uint8Array | null = null;
    for (const member of this._members) {
      const id = UTF8_ENCODER.encode(member.nodeId);
      if (id.length === 0 || id.length > RootTrustBaseV2.MAX_NODE_ID_BYTES) {
        throw new TrustBaseInvalidError(`Node id of ${id.length} bytes (1..${RootTrustBaseV2.MAX_NODE_ID_BYTES}).`);
      }
      if (previousId !== null && compareBytes(previousId, id) >= 0) {
        throw new TrustBaseInvalidError(`Members are not strictly sorted by node id at "${member.nodeId}".`);
      }
      previousId = id;

      if (member.weight < 1n || member.weight > RootTrustBaseV2.MAX_WEIGHT) {
        throw new TrustBaseInvalidError(
          `Member "${member.nodeId}": weight ${member.weight} outside 1..${RootTrustBaseV2.MAX_WEIGHT}.`,
        );
      }

      const key = member.sigKey;
      if (!isCompressedSecp256k1Key(key)) {
        throw new TrustBaseInvalidError(`Member "${member.nodeId}": not a compressed secp256k1 key.`);
      }
      // A compressed key has one encoding per point, so a byte comparison finds a repeated key: one key holder must not count for several members.
      const keyId = Array.from(key, (byte) => byte.toString(16).padStart(2, '0')).join('');
      const other = keys.get(keyId);
      if (other !== undefined) {
        throw new TrustBaseInvalidError(`Members "${other}" and "${member.nodeId}" share a signing key.`);
      }
      keys.set(keyId, member.nodeId);

      total += member.weight;
    }

    const threshold = (total * 2n) / 3n + 1n;
    if (this.quorumThreshold !== threshold) {
      throw new TrustBaseInvalidError(
        `Quorum threshold ${this.quorumThreshold}, expected ${threshold} for total weight ${total}.`,
      );
    }

    for (const [name, value] of [
      ['stateHash', this._stateHash],
      ['changeRecordHash', this._changeRecordHash],
    ] as const) {
      if (value !== null && value.length !== RootTrustBaseV2.ID_LENGTH) {
        throw new TrustBaseInvalidError(`${name} is ${value.length} bytes (null or ${RootTrustBaseV2.ID_LENGTH}).`);
      }
    }

    if (this._previousEntryId.length !== RootTrustBaseV2.ID_LENGTH) {
      throw new TrustBaseInvalidError(`Previous entry id is ${this._previousEntryId.length} bytes.`);
    }
    if (this.isGenesis()) {
      if (this._signatures !== null) {
        throw new TrustBaseInvalidError('The genesis entry carries signatures.');
      }
    } else if (this._signatures === null || this._signatures.size === 0) {
      throw new TrustBaseInvalidError('A non-genesis entry has no signatures.');
    }
  }

  /**
   * Check that this entry is a structurally valid genesis entry (zero predecessor, null signatures). A genesis is authenticated by a pin on its
   * entry id, never by signatures; the history compares the pin.
   *
   * @throws {TrustBaseInvalidError} If the entry is not a genesis entry.
   */
  public verifyGenesis(): void {
    this.validate();
    if (!this.isGenesis()) {
      throw new TrustBaseInvalidError('Not a genesis entry.');
    }
  }

  /**
   * Check the signatures of this entry's members over `data`, strictly: every supplied signature must be from a member and valid (a supplied extra
   * that is unknown or invalid fails the whole check even if the rest reach quorum), and the weight of the signers must reach the threshold.
   *
   * @param {Uint8Array} data Signed bytes.
   * @param {Map<string, Uint8Array>} signatures Signatures by node id.
   * @throws {TrustBaseSignatureError} If a signature fails or the quorum is not reached.
   */
  public async verifyQuorumSignatures(data: Uint8Array, signatures: Map<string, Uint8Array>): Promise<void> {
    const weights = await Promise.all(
      Array.from(signatures.entries(), ([nodeId, signature]) => this.verifySignature(data, signature, nodeId)),
    );
    const signed = weights.reduce((total, weight) => total + weight, 0n);
    if (signed < this.quorumThreshold) {
      throw new TrustBaseSignatureError(
        `Quorum not reached, signed weight ${signed}, threshold ${this.quorumThreshold}.`,
      );
    }
  }

  /**
   * Verify one member's signature and return the member's weight. The signature must be a canonical recoverable signature over SHA-256 of
   * `data`: exactly 65 bytes (`r || s || recovery`), recovery id 0..3, low-S, recovering to the member's key. The 64-byte compact form is not
   * accepted. This is the rule of the seal verifier, applied to entries.
   *
   * @param {Uint8Array} data Signed bytes.
   * @param {Uint8Array} signature 65-byte signature.
   * @param {string} nodeId Signer.
   * @returns {Promise<bigint>} The signer's weight.
   * @throws {TrustBaseSignatureError} If the signer is not a member or the signature is not valid.
   */
  public async verifySignature(data: Uint8Array, signature: Uint8Array, nodeId: string): Promise<bigint> {
    const member = this._members.find((candidate) => candidate.nodeId === nodeId);
    if (member === undefined) {
      throw new TrustBaseSignatureError(`Signer "${nodeId}" is not a member.`);
    }

    let decoded: Signature;
    try {
      decoded = Signature.decode(signature);
    } catch (error) {
      throw new TrustBaseSignatureError(
        `Signer "${nodeId}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const hash = await new DataHasher(HashAlgorithm.SHA256).update(data).digest();
    if (!(await RootTrustBaseV2.SIGNATURE_VERIFIER.verify(hash, decoded, member.sigKey))) {
      throw new TrustBaseSignatureError(`Signer "${nodeId}": the signature is not valid.`);
    }

    return member.weight;
  }

  /**
   * Check that this entry extends `previous`: not a genesis, same network, epoch previous + 1, a later start round, the predecessor id equal to
   * the entry id of `previous`, and a strict quorum of `previous`' members signing {@link sigBytes}.
   *
   * @param {RootTrustBaseV2} previous The predecessor.
   * @throws {TrustBaseChainError} If the entry does not extend the predecessor.
   * @throws {TrustBaseSignatureError} If the predecessor's members did not sign it.
   */
  public async verifySuccessor(previous: RootTrustBaseV2): Promise<void> {
    if (this.isGenesis()) {
      throw new TrustBaseChainError('A genesis entry has no predecessor.');
    }
    if (this.networkId.id !== previous.networkId.id) {
      throw new TrustBaseChainError(`Network ${this.networkId.id}, predecessor ${previous.networkId.id}.`);
    }
    if (this.epoch !== previous.epoch + 1n) {
      throw new TrustBaseChainError(`Epoch ${this.epoch}, predecessor ${previous.epoch}.`);
    }
    if (this.epochStartRound <= previous.epochStartRound) {
      throw new TrustBaseChainError(`Epoch start ${this.epochStartRound}, predecessor ${previous.epochStartRound}.`);
    }
    if (!areUint8ArraysEqual(this._previousEntryId, await previous.entryId())) {
      throw new TrustBaseChainError('Previous entry id does not match.');
    }

    // A decoded non-genesis entry always carries a non-empty signature map (validate).
    await previous.verifyQuorumSignatures(this.sigBytes(), this._signatures ?? new Map<string, Uint8Array>());
  }

  private encodeWithSignatures(signatures: Map<string, Uint8Array> | null): Uint8Array {
    const nullable = (bytes: Uint8Array | null): Uint8Array =>
      bytes === null ? CborSerializer.encodeNull() : CborSerializer.encodeByteString(bytes);

    const map = new CborMap(
      Array.from(
        signatures ?? [],
        ([nodeId, signature]) =>
          new CborMapEntry(CborSerializer.encodeTextString(nodeId), CborSerializer.encodeByteString(signature)),
      ),
    );

    return CborSerializer.encodeTag(
      RootTrustBaseV2.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(RootTrustBaseV2.VERSION),
        CborSerializer.encodeUnsignedInteger(this._network),
        CborSerializer.encodeUnsignedInteger(this.epoch),
        CborSerializer.encodeUnsignedInteger(this.epochStartRound),
        CborSerializer.encodeArray(
          ...this._members.map((member) =>
            CborSerializer.encodeArray(
              CborSerializer.encodeTextString(member.nodeId),
              CborSerializer.encodeByteString(member.sigKey),
              CborSerializer.encodeUnsignedInteger(member.weight),
            ),
          ),
        ),
        CborSerializer.encodeUnsignedInteger(this.quorumThreshold),
        nullable(this._stateHash),
        nullable(this._changeRecordHash),
        CborSerializer.encodeByteString(this._previousEntryId),
        signatures === null ? CborSerializer.encodeNull() : CborSerializer.encodeMap(map),
      ),
    );
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

function isCompressedSecp256k1Key(key: Uint8Array): boolean {
  if (key.length !== RootTrustBaseV2.SIGNING_KEY_LENGTH) {
    return false;
  }
  try {
    secp256k1.Point.fromBytes(key);
    return true;
  } catch {
    return false;
  }
}
