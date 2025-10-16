import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';

/**
 * Input record for UnicityCertificate.
 */
export class InputRecord {
  public constructor(
    public readonly version: bigint,
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

  public get previousHash(): Uint8Array | null {
    return this._previousHash ? new Uint8Array(this._previousHash) : null;
  }

  public get hash(): Uint8Array {
    return new Uint8Array(this._hash);
  }

  public get summaryValue(): Uint8Array {
    return new Uint8Array(this._summaryValue);
  }

  public get blockHash(): Uint8Array | null {
    return this._blockHash ? new Uint8Array(this._blockHash) : null;
  }

  public get executedTransactionsHash(): Uint8Array | null {
    return this._executedTransactionsHash ? new Uint8Array(this._executedTransactionsHash) : null;
  }

  /**
   * Create InputRecord from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return input record
   */
  public static fromCBOR(bytes: Uint8Array): InputRecord {
    const tag = CborDeserializer.readTag(bytes);
    const data = CborDeserializer.readArray(tag.data);

    return new InputRecord(
      CborDeserializer.readUnsignedInteger(data[0]),
      CborDeserializer.readUnsignedInteger(data[1]),
      CborDeserializer.readUnsignedInteger(data[2]),
      CborDeserializer.readOptional(data[3], CborDeserializer.readByteString),
      CborDeserializer.readByteString(data[4]),
      CborDeserializer.readByteString(data[5]),
      CborDeserializer.readUnsignedInteger(data[6]),
      CborDeserializer.readOptional(data[7], CborDeserializer.readByteString),
      CborDeserializer.readUnsignedInteger(data[8]),
      CborDeserializer.readOptional(data[9], CborDeserializer.readByteString),
    );
  }

  /**
   * Convert InputRecord to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      1008,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.roundNumber),
        CborSerializer.encodeUnsignedInteger(this.epoch),
        CborSerializer.encodeOptional(this.previousHash, CborSerializer.encodeByteString),
        CborSerializer.encodeByteString(this.hash),
        CborSerializer.encodeByteString(this.summaryValue),
        CborSerializer.encodeUnsignedInteger(this.timestamp),
        CborSerializer.encodeOptional(this.blockHash, CborSerializer.encodeByteString),
        CborSerializer.encodeUnsignedInteger(this.sumOfEarnedFees),
        CborSerializer.encodeOptional(this.executedTransactionsHash, CborSerializer.encodeByteString),
      ),
    );
  }
}
