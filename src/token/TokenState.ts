import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborEncoder } from '../serializer/cbor/CborEncoder.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Represents a snapshot of token ownership and associated data.
 */
export class TokenState {
  /**
   * @param unlockPredicate Predicate controlling future transfers
   * @param _data           Optional encrypted state data
   * @param hash            Hash of predicate and data
   */
  private constructor(
    public readonly unlockPredicate: IPredicate,
    private readonly _data: Uint8Array | null,
    public readonly hash: DataHash,
  ) {
    this._data = _data ? new Uint8Array(_data) : null;
  }

  /** Copy of the stored state data. */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /** Hash algorithm used for the state hash. */
  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

  /**
   * Compute a new token state from predicate and optional data.
   */
  public static async create(unlockPredicate: IPredicate, data: Uint8Array | null): Promise<TokenState> {
    return new TokenState(
      unlockPredicate,
      data,
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            unlockPredicate.hash.toCBOR(),
            CborEncoder.encodeOptional(data, CborEncoder.encodeByteString),
          ]),
        )
        .digest(),
    );
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        TokenState:
          ${this.unlockPredicate.toString()}
          Data: ${this._data ? HexConverter.encode(this._data) : null}
          Hash: ${this.hash.toString()}`;
  }
}
