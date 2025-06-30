import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { NameTagToken } from '../token/NameTagToken.js';
import { TokenState } from '../token/TokenState.js';

/**
 * Data describing a standard token transfer.
 */
export class TransactionData {
  /**
   * @param hash              Hash of the encoded data
   * @param sourceState       Previous token state
   * @param recipient         Address of the new owner
   * @param _salt             Salt for current transaction
   * @param dataHash          Optional additional data hash
   * @param _message          Optional message bytes
   * @param _nametagTokens    Optional name tag tokens
   */
  private constructor(
    public readonly hash: DataHash,
    public readonly sourceState: TokenState,
    public readonly recipient: string,
    private readonly _salt: Uint8Array,
    public readonly dataHash: DataHash | null,
    private readonly _message: Uint8Array | null,
    private readonly _nametagTokens: NameTagToken[] = [],
  ) {
    this._message = _message ? new Uint8Array(_message) : null;
    this._nametagTokens = Array.from(_nametagTokens);
  }

  /** Salt used for the transaction. */
  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  /** Optional message attached to the transfer. */
  public get message(): Uint8Array | null {
    return this._message ? new Uint8Array(this._message) : null;
  }

  /** Hash algorithm for the data hash. */
  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

  /** Nametag tokens associated with this transaction. */
  public get nametagTokens(): NameTagToken[] {
    return this._nametagTokens.slice();
  }

  /**
   * Create a new transaction data object.
   * @param state Token state used as source for the transfer
   * @param recipient Address of the new token owner
   * @param salt Random salt
   * @param dataHash Hash of new token owners data
   * @param message Message bytes
   * @param nameTags
   */
  public static async create(
    state: TokenState,
    recipient: string,
    salt: Uint8Array,
    dataHash: DataHash | null,
    message: Uint8Array | null,
    nameTags: NameTagToken[] = [],
  ): Promise<TransactionData> {
    return new TransactionData(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            state.hash.toCBOR(),
            dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
            CborEncoder.encodeTextString(recipient),
            CborEncoder.encodeByteString(salt),
            CborEncoder.encodeOptional(message, CborEncoder.encodeByteString),
          ]),
        )
        .digest(),
      state,
      recipient,
      salt,
      dataHash,
      message,
      nameTags,
    );
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      TransactionData:
        ${this.sourceState.toString()}
        Recipient: ${this.recipient.toString()}
        Salt: ${HexConverter.encode(this._salt)}
        Data: ${this.dataHash?.toString() ?? null}
        Message: ${this._message ? HexConverter.encode(this._message) : null}
        NameTags: [
          ${this._nametagTokens.map((token) => token.toString()).join('\n')}
        ]
        Hash: ${this.hash.toString()}`;
  }
}
