import { CertificationData } from './CertificationData.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { BitString } from '../util/BitString.js';

/**
 * Represents a unique state identifier derived from a public key and state hash.
 */
export class StateId {
  private constructor(private readonly hash: DataHash) {}

  public get data(): Uint8Array {
    return this.hash.data;
  }

  public get imprint(): Uint8Array {
    return this.hash.imprint;
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
      .update(
        CborSerializer.encodeArray(
          EncodedPredicate.fromPredicate(predicate).toCBOR(),
          CborSerializer.encodeByteString(stateHash.data),
        ),
      )
      .digest();

    return new StateId(hash);
  }

  public equals(id: StateId): boolean {
    return this.hash.equals(id.hash);
  }

  /**
   * Converts the StateId to a BitString.
   * @return The BitString representation of the StateId.
   */
  public toBitString(): BitString {
    return BitString.fromStateId(this);
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this.data);
  }

  /**
   * Returns a string representation of the StateId.
   * @returns The string representation.
   */
  public toString(): string {
    return `StateId[${HexConverter.encode(this.data)}]`;
  }
}
