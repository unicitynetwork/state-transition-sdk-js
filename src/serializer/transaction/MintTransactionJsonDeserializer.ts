import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { ISerializable } from '../../ISerializable.js';
import { ISplitMintReasonJson, SplitMintReason } from '../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../token/fungible/TokenCoinData.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';
import { MintReasonType } from '../../transaction/MintReasonType.js';
import {
  IMintReasonJson,
  IMintTransactionDataJson,
  MintTransactionData,
} from '../../transaction/MintTransactionData.js';
import { ITransactionJson, Transaction } from '../../transaction/Transaction.js';
import { ITokenDeserializer } from '../token/ITokenDeserializer.js';

export class MintTransactionJsonDeserializer {
  public constructor(private readonly tokenDeserializer: ITokenDeserializer) {}

  public async deserialize({
    data,
    inclusionProof,
  }: ITransactionJson<IMintTransactionDataJson>): Promise<Transaction<MintTransactionData<ISerializable | null>>> {
    return new Transaction(
      await MintTransactionData.create(
        TokenId.create(HexConverter.decode(data.tokenId)),
        TokenType.create(HexConverter.decode(data.tokenType)),
        HexConverter.decode(data.tokenData),
        data.coins ? TokenCoinData.fromJSON(data.coins) : null,
        data.recipient,
        HexConverter.decode(data.salt),
        data.dataHash ? DataHash.fromJSON(data.dataHash) : null,
        data.reason ? await this.createMintReason(data.reason as IMintReasonJson) : null,
      ),
      InclusionProof.fromJSON(inclusionProof),
    );
  }

  private createMintReason(data: IMintReasonJson): Promise<ISerializable> {
    switch (data.type) {
      case MintReasonType.TOKEN_SPLIT:
        return this.createSplitMintReason(data as ISplitMintReasonJson);
      default:
        throw new Error(`Unsupported mint reason type: ${data.type}`);
    }
  }

  private async createSplitMintReason(data: ISplitMintReasonJson): Promise<SplitMintReason> {
    const proofs = new Map<bigint, SplitMintReasonProof>();
    for (const [coinId, proof] of data.proofs) {
      proofs.set(
        BigInt(coinId),
        new SplitMintReasonProof(
          MerkleTreePath.fromJSON(proof.aggregationPath),
          MerkleSumTreePath.fromJSON(proof.coinTreePath),
        ),
      );
    }

    return new SplitMintReason(await this.tokenDeserializer.deserialize(data.token), proofs);
  }
}
