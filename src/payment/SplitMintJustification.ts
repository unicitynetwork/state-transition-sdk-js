import { SplitAssetProof } from './SplitAssetProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Token } from '../transaction/Token.js';

/**
 * Mint justification proving a new token was minted as part of a split.
 */
export class SplitMintJustification {
  public static readonly CBOR_TAG = 39044n;

  private constructor(
    public readonly token: Token,
    private readonly _proofs: SplitAssetProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  /**
   * @returns {SplitAssetProof[]} Copy of the asset proofs.
   */
  public get proofs(): SplitAssetProof[] {
    return this._proofs.slice();
  }

  /**
   * Create a SplitMintJustification.
   *
   * @param {Token} token Source token being split.
   * @param {SplitAssetProof[]} proofs Asset proofs for the new token.
   * @returns {SplitMintJustification} New justification.
   * @throws {Error} If `proofs` is empty.
   */
  public static create(token: Token, proofs: SplitAssetProof[]): SplitMintJustification {
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
      CborDeserializer.decodeArray(data[1]).map((proof) => SplitAssetProof.fromCBOR(proof)),
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
