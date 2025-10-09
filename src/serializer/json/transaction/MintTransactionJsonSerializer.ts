import { ITransactionJson } from './ITransactionJson.js';
import { IMintTransactionDataJson, MintTransactionDataJsonSerializer } from './MintTransactionDataJsonSerializer.js';
import { ISerializable } from '../../../ISerializable.js';
import { InclusionProof } from '../../../transaction/InclusionProof.js';
import { MintTransactionData } from '../../../transaction/MintTransactionData.js';
import { Transaction } from '../../../transaction/Transaction.js';
import { TokenJsonSerializer } from '../token/TokenJsonSerializer.js';

/**
 * A serializer for {@link Transaction} containing {@link MintTransactionData} objects using JSON encoding.
 * Handles serialization and deserialization of mint transactions, including their data and inclusion proof.
 */
export class MintTransactionJsonSerializer {
  private readonly dataSerializer: MintTransactionDataJsonSerializer;

  /**
   * Constructs a new `MintTransactionJsonSerializer` instance.
   *
   * @param tokenSerializer A serializer for tokens, used in mint transaction data serialization.
   */
  public constructor(tokenSerializer: TokenJsonSerializer) {
    this.dataSerializer = new MintTransactionDataJsonSerializer(tokenSerializer);
  }

  /**
   * Serializes a `Transaction` object containing `MintTransactionData` into a JSON representation.
   *
   * @param transaction The mint transaction to serialize.
   * @returns JSON representation of the mint transaction.
   */
  public static serialize(
    transaction: Transaction<MintTransactionData<ISerializable | null>>,
  ): ITransactionJson<IMintTransactionDataJson> {
    return {
      data: MintTransactionDataJsonSerializer.serialize(transaction.data),
      inclusionProof: transaction.inclusionProof.toJSON(),
    };
  }

  /**
   * Deserializes a JSON representation of a mint transaction into a `Transaction` object containing `MintTransactionData`.
   *
   * @param data The JSON data to deserialize.
   * @param inclusionProof The inclusion proof associated with the transaction.
   * @returns A promise that resolves to the deserialized mint transaction.
   */
  public async deserialize({
    data,
    inclusionProof,
  }: ITransactionJson<IMintTransactionDataJson>): Promise<Transaction<MintTransactionData<ISerializable | null>>> {
    return new Transaction(await this.dataSerializer.deserialize(data), InclusionProof.fromJSON(inclusionProof));
  }
}
