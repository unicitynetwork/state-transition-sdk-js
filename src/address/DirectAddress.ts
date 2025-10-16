import { AddressScheme } from './AddressScheme.js';
import { IAddress } from './IAddress.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Address that directly references a predicate.
 *
 * This address type is used to point to a specific predicate by its reference hash.
 * It includes a checksum to help detect mistyped addresses.
 */
export class DirectAddress implements IAddress {
  /**
   * Create a new {@link DirectAddress} instance.
   *
   * @param data     Reference to the predicate this address points to
   * @param checksum 4-byte checksum to detect mistyped addresses
   */
  private constructor(
    private readonly data: DataHash,
    private readonly checksum: Uint8Array,
  ) {
    this.checksum = new Uint8Array(checksum.slice(0, 4));
  }

  /**
   * @inheritDoc
   */
  public get scheme(): AddressScheme {
    return AddressScheme.DIRECT;
  }

  /**
   * @inheritDoc
   */
  public get address(): string {
    return this.toString();
  }

  /**
   * Build a direct address from a predicate reference.
   *
   * @param predicateReference The predicate reference to encode
   * @returns Newly created address instance
   */
  public static async create(predicateReference: DataHash): Promise<DirectAddress> {
    const checksum = await new DataHasher(HashAlgorithm.SHA256).update(predicateReference.toCBOR()).digest();
    return new DirectAddress(predicateReference, checksum.data.slice(0, 4));
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `${this.scheme}://${HexConverter.encode(this.data.imprint)}${HexConverter.encode(this.checksum)}`;
  }
}
