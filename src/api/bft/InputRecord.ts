import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborError } from '../../serialization/cbor/CborError.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Input record for UnicityCertificate.
 */
export class InputRecord {
  public static readonly CBOR_TAG = 39002n;
  private static readonly VERSION = 1n;

  public constructor(
    public readonly roundNumber: bigint,
    public readonly epoch: bigint,
    private readonly _previousHash: Uint8Array | null,
    private readonly _hash: Uint8Array,
    private readonly _summaryValue: Uint8Array,
    public readonly timestamp: bigint,
    private readonly _blockHash: Uint8Array | null,
    public readonly sumOfEarnedFees: bigint,
    private readonly _executedTransactionsHash: Uint8Array | null,
  ) {
    this._previousHash = _previousHash ? new Uint8Array(_previousHash) : null;
    this._hash = new Uint8Array(_hash);
    this._summaryValue = new Uint8Array(_summaryValue);
    this._blockHash = _blockHash ? new Uint8Array(_blockHash) : null;
    this._executedTransactionsHash = _executedTransactionsHash ? new Uint8Array(_executedTransactionsHash) : null;
  }

  /**
   * Get the block hash.
   */
  public get blockHash(): Uint8Array | null {
    return this._blockHash ? new Uint8Array(this._blockHash) : null;
  }

  /**
   * Get the executed transactions hash.
   */
  public get executedTransactionsHash(): Uint8Array | null {
    return this._executedTransactionsHash ? new Uint8Array(this._executedTransactionsHash) : null;
  }

  /**
   * Get the hash.
   */
  public get hash(): Uint8Array {
    return new Uint8Array(this._hash);
  }

  /**
   * Get the previous hash.
   */
  public get previousHash(): Uint8Array | null {
    return this._previousHash ? new Uint8Array(this._previousHash) : null;
  }

  /**
   * Get the summary value.
   */
  public get summaryValue(): Uint8Array {
    return new Uint8Array(this._summaryValue);
  }

  public get version(): bigint {
    return InputRecord.VERSION;
  }

  /**
   * Create InputRecord from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return input record
   */
  public static fromCBOR(bytes: Uint8Array): InputRecord {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== InputRecord.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for InputRecord: ${tag.tag}`);
    }
    const data = CborDeserializer.decodeArray(tag.data);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== InputRecord.VERSION) {
      throw new CborError(`Unsupported InputRecord version: ${version}`);
    }

    return new InputRecord(
      CborDeserializer.decodeUnsignedInteger(data[1]),
      CborDeserializer.decodeUnsignedInteger(data[2]),
      CborDeserializer.decodeNullable(data[3], CborDeserializer.decodeByteString),
      CborDeserializer.decodeByteString(data[4]),
      CborDeserializer.decodeByteString(data[5]),
      CborDeserializer.decodeUnsignedInteger(data[6]),
      CborDeserializer.decodeNullable(data[7], CborDeserializer.decodeByteString),
      CborDeserializer.decodeUnsignedInteger(data[8]),
      CborDeserializer.decodeNullable(data[9], CborDeserializer.decodeByteString),
    );
  }

  /**
   * Convert InputRecord to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      InputRecord.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.roundNumber),
        CborSerializer.encodeUnsignedInteger(this.epoch),
        CborSerializer.encodeNullable(this.previousHash, CborSerializer.encodeByteString),
        CborSerializer.encodeByteString(this.hash),
        CborSerializer.encodeByteString(this.summaryValue),
        CborSerializer.encodeUnsignedInteger(this.timestamp),
        CborSerializer.encodeNullable(this.blockHash, CborSerializer.encodeByteString),
        CborSerializer.encodeUnsignedInteger(this.sumOfEarnedFees),
        CborSerializer.encodeNullable(this.executedTransactionsHash, CborSerializer.encodeByteString),
      ),
    );
  }

  /**
   * Returns a string representation of the InputRecord.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Input Record
        Version: ${this.version.toString()}
        Round Number: ${this.roundNumber.toString()}
        Epoch: ${this.epoch.toString()}
        Previous Hash: ${this._previousHash ? HexConverter.encode(this._previousHash) : 'null'}
        Hash: ${HexConverter.encode(this._hash)}
        Summary Value: ${HexConverter.encode(this._summaryValue)}
        Timestamp: ${this.timestamp.toString()}
        Block Hash: ${this._blockHash ? HexConverter.encode(this._blockHash) : 'null'}
        Sum of Earned Fees: ${this.sumOfEarnedFees.toString()}
        Executed Transactions Hash: ${this._executedTransactionsHash ? HexConverter.encode(this._executedTransactionsHash) : 'null'}`;
  }
}
