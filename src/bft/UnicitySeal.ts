import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborMap } from '../serializer/cbor/CborMap.js';
import { CborMapEntry } from '../serializer/cbor/CborMapEntry.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * UnicitySeal represents a seal in the Unicity BFT system, containing metadata and signatures.
 */
export class UnicitySeal {
  public constructor(
    public readonly version: bigint,
    public readonly networkId: bigint,
    public readonly rootChainRoundNumber: bigint,
    public readonly epoch: bigint,
    public readonly timestamp: bigint,
    private readonly _previousHash: Uint8Array | null,
    private readonly _hash: Uint8Array,
    private readonly _signatures: Map<string, Uint8Array> | null,
  ) {}

  public get previousHash(): Uint8Array | null {
    return this._previousHash ? new Uint8Array(this._previousHash) : null;
  }

  public get hash(): Uint8Array {
    return new Uint8Array(this._hash);
  }

  public get signatures(): Map<string, Uint8Array> | null {
    return this._signatures
      ? new Map(Array.from(this._signatures.entries()).map(([key, value]) => [key, new Uint8Array(value)]))
      : null;
  }

  /**
   * Create unicity seal from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return unicity seal
   */
  public static fromCBOR(bytes: Uint8Array): UnicitySeal {
    const tag = CborDeserializer.readTag(bytes);
    const data = CborDeserializer.readArray(tag.data);

    return new UnicitySeal(
      CborDeserializer.readUnsignedInteger(data[0]),
      CborDeserializer.readUnsignedInteger(data[1]),
      CborDeserializer.readUnsignedInteger(data[2]),
      CborDeserializer.readUnsignedInteger(data[3]),
      CborDeserializer.readUnsignedInteger(data[4]),
      CborDeserializer.readOptional(data[5], CborDeserializer.readByteString),
      CborDeserializer.readByteString(data[6]),
      new Map(
        CborDeserializer.readMap(data[7]).map((entry) => [
          CborDeserializer.readTextString(entry.key),
          CborDeserializer.readByteString(entry.value),
        ]),
      ),
    );
  }

  /**
   * Create a new UnicitySeal instance without the signatures.
   *
   * @return a new UnicitySeal instance without the signatures
   */
  public withoutSignatures(): UnicitySeal {
    return new UnicitySeal(
      this.version,
      this.networkId,
      this.rootChainRoundNumber,
      this.epoch,
      this.timestamp,
      this.previousHash,
      this.hash,
      null,
    );
  }

  /**
   * Convert unicity seal to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      1001,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.networkId),
        CborSerializer.encodeUnsignedInteger(this.rootChainRoundNumber),
        CborSerializer.encodeUnsignedInteger(this.epoch),
        CborSerializer.encodeUnsignedInteger(this.timestamp),
        CborSerializer.encodeOptional(this.previousHash, CborSerializer.encodeByteString),
        CborSerializer.encodeByteString(this.hash),
        CborSerializer.encodeOptional(this.signatures, (signatures) =>
          CborSerializer.encodeMap(
            new CborMap(
              Array.from(signatures.entries()).map(
                ([key, value]) =>
                  new CborMapEntry(CborSerializer.encodeTextString(key), CborSerializer.encodeByteString(value)),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /**
   * Returns a string representation of the UnicitySeal.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Unicity Seal
        Version: ${this.version.toString()}
        Network ID: ${this.networkId.toString()}
        Root Chain Round Number: ${this.rootChainRoundNumber.toString()}
        Epoch: ${this.epoch.toString()}
        Timestamp: ${this.timestamp.toString()}
        Previous Hash: ${this._previousHash ? HexConverter.encode(this._previousHash) : 'null'}
        Hash: ${HexConverter.encode(this._hash)}
        Signatures: [
          ${Array.from(this._signatures?.entries() ?? [])
            .map(([key, value]) => `${key}: ${HexConverter.encode(value)}`)
            .join('\n')}
        ]`;
  }
}
