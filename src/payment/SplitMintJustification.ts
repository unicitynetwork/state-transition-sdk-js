import { SplitAssetProof } from './SplitAssetProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Token } from '../transaction/Token.js';

export class SplitMintJustification {
  public static readonly CBOR_TAG = 39044n;

  private constructor(
    public readonly token: Token,
    private readonly _proofs: SplitAssetProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  public get proofs(): SplitAssetProof[] {
    return this._proofs.slice();
  }

  public static create(token: Token, proofs: SplitAssetProof[]): SplitMintJustification {
    if (proofs.length === 0) {
      throw new Error('proofs cannot be empty.');
    }

    return new SplitMintJustification(token, proofs);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<SplitMintJustification> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== SplitMintJustification.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for SplitMintJustification: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data);

    return new SplitMintJustification(
      await Token.fromCBOR(data[0]),
      CborDeserializer.decodeArray(data[1]).map((proof) => SplitAssetProof.fromCBOR(proof)),
    );
  }

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
