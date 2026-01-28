import { SplitReasonProof } from './SplitReasonProof.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Token } from '../transaction/Token.js';

export class SplitReason {
  private constructor(
    public readonly token: Token,
    private readonly _proofs: SplitReasonProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  public get proofs(): SplitReasonProof[] {
    return this._proofs.slice();
  }

  public static create(token: Token, proofs: SplitReasonProof[]): SplitReason {
    if (proofs.length === 0) {
      throw new Error('proofs cannot be empty.');
    }

    return new SplitReason(token, proofs);
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<SplitReason> {
    const data = CborDeserializer.decodeArray(bytes);

    return new SplitReason(
      await Token.fromCBOR(data[0]),
      CborDeserializer.decodeArray(data[1]).map((proof) => SplitReasonProof.fromCBOR(proof)),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.token.toCBOR(),
      CborSerializer.encodeArray(...this._proofs.map((proof) => proof.toCBOR())),
    );
  }
}
