import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';

import { ISerializable } from '../../ISerializable.js';
import { SplitMintReason } from '../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../token/fungible/TokenCoinData.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';
import { MintReasonType } from '../../transaction/MintReasonType.js';
import { MintTransactionData } from '../../transaction/MintTransactionData.js';
import { Transaction } from '../../transaction/Transaction.js';
import { ITokenDeserializer } from '../token/ITokenDeserializer.js';

export class MintTransactionCborDeserializer {
  public constructor(private readonly tokenDeserializer: ITokenDeserializer) {}

  public async deserialize(bytes: Uint8Array): Promise<Transaction<MintTransactionData<ISerializable | null>>> {
    const transaction = CborDecoder.readArray(bytes);
    const data = CborDecoder.readArray(transaction[0]);
    return new Transaction(
      await MintTransactionData.create(
        TokenId.create(CborDecoder.readByteString(data[0])),
        TokenType.create(CborDecoder.readByteString(data[1])),
        CborDecoder.readByteString(data[2]),
        CborDecoder.readOptional(data[3], TokenCoinData.fromCBOR),
        CborDecoder.readTextString(data[4]),
        CborDecoder.readByteString(data[5]),
        CborDecoder.readOptional(data[6], DataHash.fromCBOR),
        data[7] ? await this.createMintReason(data[7]) : null,
      ),
      InclusionProof.fromCBOR(transaction[1]),
    );
  }

  private createMintReason(bytes: Uint8Array): Promise<ISerializable> {
    const data = CborDecoder.readArray(bytes);
    const type = CborDecoder.readTextString(data[0]);
    switch (type) {
      case MintReasonType.TOKEN_SPLIT:
        return this.createSplitMintReason(bytes);
      default:
        throw new Error(`Unsupported mint reason type: ${type}`);
    }
  }

  private async createSplitMintReason(bytes: Uint8Array): Promise<SplitMintReason> {
    const data = CborDecoder.readArray(bytes);
    const proofs = new Map<bigint, SplitMintReasonProof>();
    const token = await this.tokenDeserializer.deserialize(data[0]);
    const proofListBytes = CborDecoder.readArray(data[1]);
    for (const proofBytes of proofListBytes) {
      const proofWithCoin = CborDecoder.readArray(proofBytes);
      const coinId = BigintConverter.decode(CborDecoder.readByteString(proofWithCoin[0]));
      const proof = CborDecoder.readArray(proofWithCoin[1]);
      proofs.set(
        BigInt(coinId),
        new SplitMintReasonProof(MerkleTreePath.fromCBOR(proof[0]), MerkleSumTreePath.fromCBOR(proof[1])),
      );
    }

    return new SplitMintReason(token, proofs);
  }
}
