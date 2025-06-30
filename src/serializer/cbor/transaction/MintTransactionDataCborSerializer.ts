import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';

import { ISerializable } from '../../../ISerializable.js';
import { SplitMintReason } from '../../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../../token/fungible/TokenCoinData.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { MintReasonType } from '../../../transaction/MintReasonType.js';
import { MintTransactionData } from '../../../transaction/MintTransactionData.js';
import { ITokenSerializer } from '../../token/ITokenSerializer.js';

/**
 * A serializer for {@link MintTransactionData} objects using CBOR encoding.
 * Handles serialization and deserialization of mint transaction data for tokens.
 */
export class MintTransactionDataCborSerializer {
  /**
   * Constructs a new MintTransactionDataCborSerializer.
   * @param tokenSerializer Token serializer used for token-specific deserialization.
   */
  public constructor(private readonly tokenSerializer: ITokenSerializer) {}

  /**
   * Serializes MintTransactionData into a CBOR-encoded byte array.
   * @param data The MintTransactionData to serialize.
   * @returns CBOR-encoded byte array.
   */
  public static serialize(data: MintTransactionData<ISerializable | null>): Uint8Array {
    return CborEncoder.encodeArray([
      data.tokenId.toCBOR(),
      data.tokenType.toCBOR(),
      CborEncoder.encodeByteString(data.tokenData),
      data.coinData?.toCBOR() ?? CborEncoder.encodeNull(),
      CborEncoder.encodeTextString(data.recipient),
      CborEncoder.encodeByteString(data.salt),
      data.dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
      data.reason?.toCBOR() ?? CborEncoder.encodeNull(),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded byte array into MintTransactionData.
   * @param bytes The CBOR-encoded data.
   * @returns A Promise resolving to the deserialized MintTransactionData.
   */
  public async deserialize(bytes: Uint8Array): Promise<MintTransactionData<ISerializable | null>> {
    const data = CborDecoder.readArray(bytes);
    return MintTransactionData.create(
      TokenId.create(CborDecoder.readByteString(data[0])),
      TokenType.create(CborDecoder.readByteString(data[1])),
      CborDecoder.readByteString(data[2]),
      CborDecoder.readOptional(data[3], TokenCoinData.fromCBOR),
      CborDecoder.readTextString(data[4]),
      CborDecoder.readByteString(data[5]),
      CborDecoder.readOptional(data[6], DataHash.fromCBOR),
      await CborDecoder.readOptional(data[7], this.createMintReason),
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
    const token = await this.tokenSerializer.deserialize(data[0]);
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
