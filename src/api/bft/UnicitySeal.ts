import { DataHash } from '../../crypto/hash/DataHash.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborError } from '../../serialization/cbor/CborError.js';
import { CborMap } from '../../serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../serialization/cbor/CborMapEntry.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { NetworkId } from '../NetworkId.js';

/**
 * UnicitySeal represents a seal in the Unicity BFT system, containing metadata and signatures.
 */
export class UnicitySeal {
  public static readonly CBOR_TAG = 39005n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly networkId: NetworkId,
    public readonly rootChainRoundNumber: bigint,
    public readonly epoch: bigint,
    public readonly timestamp: bigint,
    private readonly _previousHash: Uint8Array | null,
    private readonly _hash: Uint8Array,
    private readonly _signatures: Map<string, Uint8Array> | null,
  ) {}

  /**
   * @returns {Uint8Array} Copy of the seal hash bytes.
   */
  public get hash(): Uint8Array {
    return new Uint8Array(this._hash);
  }

  /**
   * @returns {Uint8Array|null} Copy of the previous-seal hash, or `null` if absent.
   */
  public get previousHash(): Uint8Array | null {
    return this._previousHash ? new Uint8Array(this._previousHash) : null;
  }

  /**
   * @returns {Map<string, Uint8Array>|null} Copy of the signer-to-signature map, or `null` if absent.
   */
  public get signatures(): Map<string, Uint8Array> | null {
    return this._signatures
      ? new Map(Array.from(this._signatures.entries()).map(([key, value]) => [key, new Uint8Array(value)]))
      : null;
  }

  /**
   * @returns {bigint} Wire-format version of this seal.
   */
  public get version(): bigint {
    return UnicitySeal.VERSION;
  }

  /**
   * Create a UnicitySeal and sign it with the given signing services.
   *
   * @param {NetworkId} networkId Network identifier.
   * @param {bigint} rootChainRoundNumber Root-chain round number.
   * @param {bigint} epoch Epoch number.
   * @param {bigint} timestamp Timestamp.
   * @param {Uint8Array|null} _previousHash Previous-seal hash, or `null` for the first seal.
   * @param {Uint8Array} _hash Hash being sealed.
   * @param {Map<string, SigningService>} signers Signing services keyed by signer id.
   * @returns {Promise<UnicitySeal>} Signed seal.
   */
  public static async create(
    networkId: NetworkId,
    rootChainRoundNumber: bigint,
    epoch: bigint,
    timestamp: bigint,
    _previousHash: Uint8Array | null,
    _hash: Uint8Array,
    signers: Map<string, SigningService>,
  ): Promise<UnicitySeal> {
    const seal = new UnicitySeal(networkId, rootChainRoundNumber, epoch, timestamp, _previousHash, _hash, null);

    const hash = await seal.calculateHash();

    return new UnicitySeal(
      seal.networkId,
      seal.rootChainRoundNumber,
      seal.epoch,
      seal.timestamp,
      seal._previousHash,
      seal._hash,
      new Map(
        (await Promise.all(
          Array.from(signers.entries()).map(([key, signingService]) =>
            signingService.sign(hash).then((signature) => [key, signature.encode()]),
          ),
        )) as [string, Uint8Array][],
      ),
    );
  }

  /**
   * Create unicity seal from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return unicity seal
   */
  public static fromCBOR(bytes: Uint8Array): UnicitySeal {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== UnicitySeal.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for UnicitySeal: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 8);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== UnicitySeal.VERSION) {
      throw new CborError(`Unsupported UnicitySeal version: ${version}`);
    }

    return new UnicitySeal(
      NetworkId.fromId(CborDeserializer.decodeUnsignedInteger(data[1])),
      CborDeserializer.decodeUnsignedInteger(data[2]),
      CborDeserializer.decodeUnsignedInteger(data[3]),
      CborDeserializer.decodeUnsignedInteger(data[4]),
      CborDeserializer.decodeNullable(data[5], CborDeserializer.decodeByteString),
      CborDeserializer.decodeByteString(data[6]),
      new Map(
        CborDeserializer.decodeMap(data[7]).map((entry) => [
          CborDeserializer.decodeTextString(entry.key),
          CborDeserializer.decodeByteString(entry.value),
        ]),
      ),
    );
  }

  /**
   * @returns {Promise<DataHash>} Hash of this seal, computed without the signatures.
   */
  public calculateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        new UnicitySeal(
          this.networkId,
          this.rootChainRoundNumber,
          this.epoch,
          this.timestamp,
          this.previousHash,
          this.hash,
          null,
        ).toCBOR(),
      )
      .digest();
  }

  /**
   * Convert unicity seal to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      UnicitySeal.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.networkId.id),
        CborSerializer.encodeUnsignedInteger(this.rootChainRoundNumber),
        CborSerializer.encodeUnsignedInteger(this.epoch),
        CborSerializer.encodeUnsignedInteger(this.timestamp),
        CborSerializer.encodeNullable(this.previousHash, CborSerializer.encodeByteString),
        CborSerializer.encodeByteString(this.hash),
        CborSerializer.encodeNullable(this.signatures, (signatures) =>
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
