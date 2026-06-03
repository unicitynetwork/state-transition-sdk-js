import { CertificationData } from './CertificationData.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Represents a unique state identifier derived from a public key and state hash.
 */
export class StateId {
  private constructor(private readonly hash: DataHash) {}

  /**
   * @returns {Uint8Array} Underlying state-id hash bytes.
   */
  public get data(): Uint8Array {
    return this.hash.data;
  }

  /**
   * Create StateId from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {StateId} Decoded state id.
   */
  public static fromCBOR(bytes: Uint8Array): StateId {
    return new StateId(new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(bytes)));
  }

  /**
   * Create StateId from certification data.
   *
   * @param {CertificationData} certificationData Certification data.
   * @returns {Promise<StateId>} Derived state id.
   */
  public static fromCertificationData(certificationData: CertificationData): Promise<StateId> {
    return StateId.create(certificationData.lockScript, certificationData.sourceStateHash);
  }

  /**
   * Create StateId from a transaction's lock script and source state hash.
   *
   * @param {ITransaction} transaction Transaction.
   * @returns {Promise<StateId>} Derived state id.
   */
  public static fromTransaction(transaction: ITransaction): Promise<StateId> {
    return StateId.create(transaction.lockScript, transaction.sourceStateHash);
  }

  /**
   * Creates a StateId from a public key and state hash.
   * @param predicate predicate as a Uint8Array.
   * @param stateHash state hash.
   * @returns A Promise resolving to a StateId instance.
   */
  private static async create(predicate: EncodedPredicate, stateHash: DataHash): Promise<StateId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeArray(predicate.toCBOR(), CborSerializer.encodeByteString(stateHash.data)))
      .digest();

    return new StateId(hash);
  }

  /**
   * Equality check against another state id.
   *
   * @param {StateId} id Other state id.
   * @returns {boolean} True if the two state ids share the same hash.
   */
  public equals(id: StateId): boolean {
    return this.hash.equals(id.hash);
  }

  /**
   * Convert StateId to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this.data);
  }

  /**
   * @returns {string} String representation of the state id.
   */
  public toString(): string {
    return `StateId[${HexConverter.encode(this.data)}]`;
  }
}
