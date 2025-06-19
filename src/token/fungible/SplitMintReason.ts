import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';

import { BigintConverter } from '../../../../commons/src/util/BigintConverter.js';
import { ISerializable } from '../../ISerializable.js';
import { MintTransactionData } from '../../transaction/MintTransactionData.js';
import { Transaction } from '../../transaction/Transaction.js';
import { ITokenJson, Token } from '../Token.js';
import { ISplitMintReasonProofJson, SplitMintReasonProof } from './SplitMintReasonProof.js';
import { MintReasonType } from '../../transaction/MintReasonType.js';

export interface ISplitMintReasonJson {
  type: MintReasonType.TOKEN_SPLIT;
  token: ITokenJson;
  proofs: [string, ISplitMintReasonProofJson][];
}

export class SplitMintReason implements ISerializable {
  public constructor(
    public readonly token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
    private readonly _proofs: Map<bigint, SplitMintReasonProof>,
  ) {
    this._proofs = new Map(_proofs);
  }

  public get proofs(): Map<bigint, SplitMintReasonProof> {
    return new Map(this._proofs);
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.token.toCBOR(),
      CborEncoder.encodeArray(
        Array.from(this._proofs.entries()).map(([coinId, proof]) =>
          CborEncoder.encodeArray([CborEncoder.encodeByteString(BigintConverter.encode(coinId)), proof.toCBOR()]),
        ),
      ),
    ]);
  }

  public toJSON(): ISplitMintReasonJson {
    return {
      proofs: Array.from(this._proofs).map(([coinId, proof]) => [coinId.toString(), proof.toJSON()]),
      token: this.token.toJSON(),
      type: MintReasonType.TOKEN_SPLIT,
    };
  }
}
