import { MintTransactionDataCborSerializer } from './MintTransactionDataCborSerializer.js';
import { ISerializable } from '../../../ISerializable.js';
import { InclusionProof } from '../../../transaction/InclusionProof.js';
import { MintTransactionData } from '../../../transaction/MintTransactionData.js';
import { Transaction } from '../../../transaction/Transaction.js';
import { CborDecoder } from '../CborDecoder.js';
import { CborEncoder } from '../CborEncoder.js';
import { TokenCborSerializer } from '../token/TokenCborSerializer.js';

/**
 * A serializer for {@link Transaction} containing {@link MintTransactionData} using CBOR encoding.
 * Handles serialization and deserialization of mint transactions, including their data and inclusion proof.
 */
export class MintTransactionCborSerializer {
  private readonly dataSerializer: MintTransactionDataCborSerializer;

  /**
   * Constructs a new `MintTransactionCborSerializer` instance.
   *
   * @param {TokenCborSerializer} tokenSerializer - A serializer for tokens, used in mint transaction data serialization.
   */
  public constructor(tokenSerializer: TokenCborSerializer) {
    this.dataSerializer = new MintTransactionDataCborSerializer(tokenSerializer);
  }

  /**
   * Serializes a `Transaction` object containing `MintTransactionData` into a CBOR-encoded byte array.
   *
   * @param {Transaction<MintTransactionData<ISerializable | null>>} transaction - The mint transaction to serialize.
   * @returns {Uint8Array} The CBOR-encoded representation of the mint transaction.
   */
  public static serialize(transaction: Transaction<MintTransactionData<ISerializable | null>>): Uint8Array {
    return CborEncoder.encodeArray([
      MintTransactionDataCborSerializer.serialize(transaction.data),
      transaction.inclusionProof.toCBOR(),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded `Uint8Array` into a `Transaction` object containing `MintTransactionData`.
   *
   * @param {Uint8Array} bytes - The CBOR-encoded data to deserialize.
   * @returns {Promise<Transaction<MintTransactionData<ISerializable | null>>>}
   *          A promise that resolves to the deserialized mint transaction.
   */
  public async deserialize(bytes: Uint8Array): Promise<Transaction<MintTransactionData<ISerializable | null>>> {
    const transaction = CborDecoder.readArray(bytes);
    return new Transaction(
      await this.dataSerializer.deserialize(transaction[0]),
      InclusionProof.fromCBOR(transaction[1]),
    );
  }
}
