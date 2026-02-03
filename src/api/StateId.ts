import { CertificationData } from './CertificationData.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { BitString } from '../util/BitString.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * Represents a unique state identifier derived from a public key and state hash.
 */
export class StateId {
  private readonly _bytes: Uint8Array;

  private constructor(hash: DataHash) {
    this._bytes = new Uint8Array(hash.data);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  public static fromCBOR(bytes: Uint8Array): StateId {
    return new StateId(new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(bytes)));
  }

  /**
   * Creates a StateId from CertificationData.
   * @param certificationData certification data.
   */
  public static fromCertificationData(certificationData: CertificationData): Promise<StateId> {
    return StateId.create(certificationData.lockScript, certificationData.sourceStateHash);
  }

  public static fromTransaction(transaction: ITransaction): Promise<StateId> {
    return StateId.create(transaction.lockScript, transaction.sourceStateHash);
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

  public equals(id: StateId): boolean {
    return areUint8ArraysEqual(this._bytes, id._bytes);
  }

  /**
   * Converts the StateId to a BitString.
   * @return The BitString representation of the StateId.
   */
  public toBitString(): BitString {
    return BitString.fromStateId(this);
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * Returns a string representation of the StateId.
   * @returns The string representation.
   */
  public toString(): string {
    return `StateId[${HexConverter.encode(this._bytes)}]`;
  }
}
