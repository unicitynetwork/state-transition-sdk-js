import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { MintTransactionData } from './MintTransactionData.js';
import { OfflineCommitment } from './OfflineCommitment.js';
import { Transaction } from './Transaction.js';
import { ITransactionDataJson, TransactionData } from './TransactionData.js';
import { ISerializable } from '../ISerializable.js';
import { PredicateJsonFactory } from '../predicate/PredicateJsonFactory.js';
import { TokenJsonDeserializer } from '../serializer/token/TokenJsonDeserializer.js';
import { ITokenJson, Token } from '../token/Token.js';
import { TokenFactory } from '../token/TokenFactory.js';
import { TokenState } from '../token/TokenState.js';
import { JsonUtils } from '../utils/JsonUtils.js';

/** JSON representation of an {@link OfflineTransaction}. */
export interface IOfflineTransactionJson {
  readonly commitment: {
    readonly requestId: string;
    readonly transactionData: ITransactionDataJson;
    readonly authenticator: unknown;
  };
  readonly token: ITokenJson;
}

/**
 * Represents a transaction with its commitment for offline processing.
 */
export class OfflineTransaction implements ISerializable {
  /**
   * @param commitment  The commitment for the transaction
   * @param token
   */
  public constructor(
    public readonly commitment: OfflineCommitment,
    public readonly token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
  ) {}

  /**
   * Create OfflineTransaction from JSON data.
   * This properly deserializes all components using the necessary factories.
   * @param data JSON data
   */
  public static async fromJSON(data: unknown): Promise<OfflineTransaction> {
    if (!OfflineTransaction.isJSON(data)) {
      throw new Error('Invalid offline transaction JSON format');
    }

    // Initialize the necessary factories
    const predicateFactory = new PredicateJsonFactory();
    const tokenFactory = new TokenFactory(new TokenJsonDeserializer(predicateFactory));

    // Deserialize the token from JSON
    const token = await tokenFactory.create(data.token);

    // Reconstruct the commitment components
    const requestId = RequestId.fromJSON(data.commitment.requestId);
    const authenticator = Authenticator.fromJSON(data.commitment.authenticator);

    // Reconstruct the transaction data
    const txData = data.commitment.transactionData;
    const transactionData = await TransactionData.create(
      await TokenState.create(
        await predicateFactory.create(token.id, token.type, txData.sourceState.unlockPredicate),
        txData.sourceState.data ? HexConverter.decode(txData.sourceState.data) : null,
      ),
      txData.recipient,
      HexConverter.decode(txData.salt),
      txData.dataHash ? DataHash.fromJSON(txData.dataHash) : null,
      txData.message ? HexConverter.decode(txData.message) : null,
      [], // nameTags - TODO: deserialize if needed
    );

    // Create the OfflineCommitment
    const offlineCommitment = new OfflineCommitment(requestId, transactionData, authenticator);

    return new OfflineTransaction(offlineCommitment, token);
  }

  /**
   * Create OfflineTransaction from JSON string.
   * This method can handle JSON strings that were created with toJSONString().
   *
   * @param jsonString JSON string representation
   * @returns Promise<OfflineTransaction>
   */
  public static fromJSONString(jsonString: string): Promise<OfflineTransaction> {
    const parsed = JsonUtils.parse(jsonString);
    return OfflineTransaction.fromJSON(parsed);
  }

  /**
   * Type guard to check if data is valid OfflineTransaction JSON.
   * @param data Data to validate
   */
  private static isJSON(data: unknown): data is IOfflineTransactionJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'commitment' in data &&
      'token' in data &&
      typeof data.commitment === 'object' &&
      typeof data.token === 'object'
    );
  }

  /** Serialize to CBOR format */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeArray([
        this.commitment.requestId.toCBOR(),
        this.commitment.transactionData.toCBOR(),
        this.commitment.authenticator.toCBOR(),
      ]),
      this.token.toCBOR(),
    ]);
  }

  /** Serialize to JSON format */
  public toJSON(): IOfflineTransactionJson {
    return {
      commitment: {
        authenticator: this.commitment.authenticator.toJSON(),
        requestId: this.commitment.requestId.toJSON(),
        transactionData: this.commitment.transactionData.toJSON(),
      },
      token: this.token.toJSON(),
    };
  }

  /**
   * Serialize to JSON string with BigInt support.
   * This method handles potential BigInt values that might exist in the object graph
   * and converts them to strings to prevent JSON serialization errors.
   *
   * Use this method when you need to serialize for actual transfer (e.g., NFC, file, etc.).
   *
   * @param space Optional spacing for formatting
   * @returns JSON string with BigInt values safely converted
   */
  public toJSONString(space?: string | number): string {
    return JsonUtils.safeStringify(this, space);
  }
}
