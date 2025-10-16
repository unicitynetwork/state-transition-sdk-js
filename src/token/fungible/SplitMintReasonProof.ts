import { CoinId } from './CoinId.js';
import { ISparseMerkleTreePathJson, SparseMerkleTreePath } from '../../mtree/plain/SparseMerkleTreePath.js';
import { ISparseMerkleSumTreePathJson, SparseMerkleSumTreePath } from '../../mtree/sum/SparseMerkleSumTreePath.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';

export interface ISplitMintReasonProofJson {
  readonly coinId: string;
  readonly aggregationPath: ISparseMerkleTreePathJson;
  readonly coinTreePath: ISparseMerkleSumTreePathJson;
}

export class SplitMintReasonProof {
  public constructor(
    public readonly coinId: CoinId,
    public readonly aggregationPath: SparseMerkleTreePath,
    public readonly coinTreePath: SparseMerkleSumTreePath,
  ) {}

  /**
   * Create split mint reason from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return split mint reason proof
   */
  public static fromCBOR(bytes: Uint8Array): SplitMintReasonProof {
    const data = CborDeserializer.readArray(bytes);

    return new SplitMintReasonProof(
      CoinId.fromCBOR(data[0]),
      SparseMerkleTreePath.fromCBOR(data[1]),
      SparseMerkleSumTreePath.fromCBOR(data[2]),
    );
  }

  public static isJSON(input: unknown): input is ISplitMintReasonProofJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'coinId' in input &&
      'aggregationPath' in input &&
      'coinTreePath' in input
    );
  }

  public static fromJSON(input: unknown): SplitMintReasonProof {
    if (!SplitMintReasonProof.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new SplitMintReasonProof(
      CoinId.fromJSON(input.coinId),
      SparseMerkleTreePath.fromJSON(input.aggregationPath),
      SparseMerkleSumTreePath.fromJSON(input.coinTreePath),
    );
  }

  public toJSON(): ISplitMintReasonProofJson {
    return {
      aggregationPath: this.aggregationPath.toJSON(),
      coinId: this.coinId.toJSON(),
      coinTreePath: this.coinTreePath.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.aggregationPath.toCBOR(), this.coinTreePath.toCBOR());
  }
}
