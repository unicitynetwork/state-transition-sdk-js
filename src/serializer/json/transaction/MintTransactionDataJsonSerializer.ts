import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { ISerializable } from '../../../ISerializable.js';
import { ISplitMintReasonJson, SplitMintReason } from '../../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData, TokenCoinDataJson } from '../../../token/fungible/TokenCoinData.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { MintReasonType } from '../../../transaction/MintReasonType.js';
import { MintTransactionData } from '../../../transaction/MintTransactionData.js';
import { TokenJsonSerializer } from '../token/TokenJsonSerializer.js';

/**
 * JSON representation of a mint reason.
 */
export interface IMintReasonJson {
  readonly type: string;
}

/** JSON representation of {@link MintTransactionData}. */
export interface IMintTransactionDataJson {
  readonly tokenId: string;
  readonly tokenType: string;
  readonly tokenData: string;
  readonly coins: TokenCoinDataJson | null;
  readonly recipient: string;
  readonly salt: string;
  readonly dataHash: string | null;
  readonly reason: unknown | null;
}

/**
 * A serializer for {@link MintTransactionData} objects using JSON encoding.
 * Handles serialization and deserialization of mint transaction data for tokens.
 */
export class MintTransactionDataJsonSerializer {
  /**
   * Constructs a new `MintTransactionDataJsonSerializer` instance.
   *
   * @param tokenSerializer Token serializer used for token-specific deserialization.
   */
  public constructor(private readonly tokenSerializer: TokenJsonSerializer) {}

  /**
   * Serializes `MintTransactionData` into a JSON representation.
   *
   * @param data The `MintTransactionData` to serialize.
   * @returns JSON representation of the mint transaction data.
   */
  public static serialize(data: MintTransactionData<ISerializable | null>): IMintTransactionDataJson {
    return {
      coins: data.coinData?.toJSON() ?? null,
      dataHash: data.dataHash?.toJSON() ?? null,
      reason: data.reason?.toJSON() ?? null,
      recipient: data.recipient,
      salt: HexConverter.encode(data.salt),
      tokenData: HexConverter.encode(data.tokenData),
      tokenId: data.tokenId.toJSON(),
      tokenType: data.tokenType.toJSON(),
    };
  }

  /**
   * Deserializes a JSON representation into `MintTransactionData`.
   *
   * @param data The JSON data to deserialize.
   * @returns A promise that resolves to the deserialized `MintTransactionData`.
   */
  public async deserialize(data: IMintTransactionDataJson): Promise<MintTransactionData<ISerializable | null>> {
    return MintTransactionData.create(
      TokenId.create(HexConverter.decode(data.tokenId)),
      TokenType.create(HexConverter.decode(data.tokenType)),
      HexConverter.decode(data.tokenData),
      data.coins ? TokenCoinData.fromJSON(data.coins) : null,
      data.recipient,
      HexConverter.decode(data.salt),
      data.dataHash ? DataHash.fromJSON(data.dataHash) : null,
      data.reason ? await this.createMintReason(data.reason as IMintReasonJson) : null,
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

    return new SplitMintReason(await this.tokenSerializer.deserialize(data.token), proofs);
  }
}
