import { CertificationData } from './CertificationData.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { BitString } from '../util/BitString.js';

/**
 * Represents a unique state identifier derived from a public key and state hash.
 */
export class StateId {
  /**
   * Constructs a StateId instance.
   * @param hash The DataHash representing the state ID.
   */
  private constructor(private readonly hash: DataHash) {}

  /**
   * Decodes a StateId from CBOR bytes.
   * @param data The CBOR-encoded bytes.
   * @returns A StateId instance.
   */
  public static fromCBOR(data: Uint8Array): StateId {
    return new StateId(DataHash.fromCBOR(data));
  }

  /**
   * Creates a StateId from CertificationData.
   * @param certificationData certification data.
   */
  public static fromCertificationData(certificationData: CertificationData): Promise<StateId> {
    return StateId.create(certificationData.lockScript, certificationData.sourceStateHash);
  }

  /**
   * Creates a StateId from a JSON string.
   * @param data The JSON string.
   * @returns A StateId instance.
   */
  public static fromJSON(data: string): StateId {
    return new StateId(DataHash.fromJSON(data));
  }

  public static async fromTransaction(transaction: ITransaction): Promise<StateId> {
    return StateId.create(transaction.lockScript, await transaction.calculateStateHash());
  }

  /**
   * Creates a StateId from a public key and state hash.
   * @param predicate predicate as a Uint8Array.
   * @param stateHash state hash.
   * @returns A Promise resolving to a StateId instance.
   */
  private static async create(predicate: IPredicate, stateHash: DataHash): Promise<StateId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeArray(predicate.toCBOR(), CborSerializer.encodeByteString(stateHash.imprint)))
      .digest();

    return new StateId(hash);
  }

  /**
   * Converts the StateId to a BitString.
   * @return The BitString representation of the StateId.
   */
  public toBitString(): BitString {
    return BitString.fromStateId(this.hash);
  }

  public toCBOR(): Uint8Array {
    return this.hash.toCBOR();
  }

  public toJSON(): string {
    return this.hash.toJSON();
  }

  /**
   * Returns a string representation of the StateId.
   * @returns The string representation.
   */
  public toString(): string {
    return `StateId[${this.hash.toString()}]`;
  }
}
