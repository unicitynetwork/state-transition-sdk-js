import { IMintTransactionReason } from './IMintTransactionReason.js';
import { ReasonTypeId } from './ReasonTypeId.js';

/**
 * Deserializers for a mint transaction reason type.
 */
export interface IReasonDeserializers {
  fromCBOR: (bytes: Uint8Array) => Promise<IMintTransactionReason> | IMintTransactionReason;
  fromJSON: (json: unknown) => Promise<IMintTransactionReason> | IMintTransactionReason;
}

/**
 * Factory for registering and deserializing mint transaction reasons.
 * Uses a singleton registry pattern to map reason type IDs to their deserializers.
 */
export class MintReasonFactory {
  private static registry = new Map<string, IReasonDeserializers>();

  /**
   * Register a reason type with its deserializers.
   * @param typeId The reason type identifier
   * @param deserializers CBOR and JSON deserializers for this reason type
   */
  public static register(typeId: ReasonTypeId, deserializers: IReasonDeserializers): void {
    const key = typeId.toHexString();
    if (MintReasonFactory.registry.has(key)) {
      throw new Error(`Reason type ${key} is already registered`);
    }
    MintReasonFactory.registry.set(key, deserializers);
  }

  /**
   * Deserialize a reason from CBOR bytes.
   * @param typeId The reason type identifier
   * @param bytes CBOR bytes
   * @returns Deserialized reason
   * @throws Error if type ID is not registered
   */
  public static async fromCBOR(typeId: ReasonTypeId, bytes: Uint8Array): Promise<IMintTransactionReason> {
    const key = typeId.toHexString();
    const deserializers = MintReasonFactory.registry.get(key);
    if (!deserializers) {
      throw new Error(`Unknown reason type ID: ${key}`);
    }
    return await deserializers.fromCBOR(bytes);
  }

  /**
   * Deserialize a reason from JSON.
   * @param typeIdHex The reason type identifier as hex string
   * @param json JSON representation
   * @returns Deserialized reason
   * @throws Error if type ID is not registered
   */
  public static async fromJSON(typeIdHex: string, json: unknown): Promise<IMintTransactionReason> {
    const deserializers = MintReasonFactory.registry.get(typeIdHex);
    if (!deserializers) {
      throw new Error(`Unknown reason type ID: ${typeIdHex}`);
    }
    return await deserializers.fromJSON(json);
  }

  /**
   * Check if a reason type is registered.
   * @param typeId The reason type identifier
   * @returns true if registered
   */
  public static isRegistered(typeId: ReasonTypeId): boolean {
    return MintReasonFactory.registry.has(typeId.toHexString());
  }

  /**
   * Clear all registered reason types (primarily for testing).
   */
  public static clear(): void {
    MintReasonFactory.registry.clear();
  }
}
