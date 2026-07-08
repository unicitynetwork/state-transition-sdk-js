import { SplitAllocationProof } from './SplitAllocationProof.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Token } from '../transaction/Token.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenSalt } from '../transaction/TokenSalt.js';

/** ASCII domain separator `UNICITY_SPLIT_OUTPUT` for the split output commitment. */
const SPLIT_OUTPUT = new TextEncoder().encode('UNICITY_SPLIT_OUTPUT');

/**
 * Split mint reason: CBOR semantic tag 39044 applied to the two-element array
 * `[burned source token, split allocation proofs]`, where the proofs appear in
 * canonical output-asset order, one per asset the minted output carries.
 */
export class SplitMintJustification {
  public static readonly CBOR_TAG = 39044n;

  private constructor(
    public readonly token: Token,
    private readonly _proofs: SplitAllocationProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  /**
   * @returns {SplitAllocationProof[]} Copy of the allocation proofs.
   */
  public get proofs(): SplitAllocationProof[] {
    return this._proofs.slice();
  }

  /**
   * Calculate the sum-tree leaf data `d_j` for a split output: a commitment that binds
   * an allocation leaf to its output mint transaction. Every term is a CBOR byte string
   * except the network identifier, which is an unsigned integer. The mint reason is
   * deliberately excluded — it embeds the proofs, which are derived from this value.
   *
   * @param {Token} token Token which is going to be burnt; its identifier, network and token type are bound
   *   into the commitment (a split preserves the source network and token type, so the output's equal them).
   * @param {EncodedPredicate} recipient Output recipient predicate.
   * @param {TokenSalt} salt Output mint salt.
   * @param {TokenId} tokenId Output token identifier.
   * @param {Uint8Array} data Exact output auxiliary-payload byte string.
   * @returns {Promise<Uint8Array>} Raw 32-byte commitment digest.
   */
  public static async calculateLeafData(
    token: Token,
    recipient: EncodedPredicate,
    salt: TokenSalt,
    tokenId: TokenId,
    data: Uint8Array | null,
  ): Promise<Uint8Array> {
    return (
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(SPLIT_OUTPUT),
            CborSerializer.encodeByteString(token.id.bytes),
            CborSerializer.encodeUnsignedInteger(token.networkId.id),
            CborSerializer.encodeByteString(recipient.toCBOR()),
            salt.toCBOR(),
            tokenId.toCBOR(),
            token.type.toCBOR(),
            CborSerializer.encodeNullable(data, CborSerializer.encodeByteString),
          ),
        )
        .digest()
    ).data;
  }

  /**
   * Create a SplitMintJustification.
   *
   * @param {Token} token Burned source token (including its certified burn transfer).
   * @param {SplitAllocationProof[]} proofs Allocation proofs in canonical output-asset order.
   * @returns {SplitMintJustification} New justification.
   * @throws {Error} If `proofs` is empty.
   */
  public static create(token: Token, proofs: SplitAllocationProof[]): SplitMintJustification {
    if (proofs.length === 0) {
      throw new Error('proofs cannot be empty.');
    }

    return new SplitMintJustification(token, proofs);
  }

  /**
   * Create SplitMintJustification from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<SplitMintJustification>} Decoded justification.
   * @throws {CborError} On wrong tag.
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<SplitMintJustification> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== SplitMintJustification.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for SplitMintJustification: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 2);

    return SplitMintJustification.create(
      await Token.fromCBOR(data[0]),
      CborDeserializer.decodeArray(data[1]).map((proof) => SplitAllocationProof.fromCBOR(proof)),
    );
  }

  /**
   * Convert SplitMintJustification to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      SplitMintJustification.CBOR_TAG,
      CborSerializer.encodeArray(
        this.token.toCBOR(),
        CborSerializer.encodeArray(...this._proofs.map((proof) => proof.toCBOR())),
      ),
    );
  }
}
