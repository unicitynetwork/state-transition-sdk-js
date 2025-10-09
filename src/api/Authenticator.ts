import { RequestId } from './RequestId.js';
import { DataHash } from '../hash/DataHash.js';
import { CborDecoder } from '../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../serializer/cbor/CborEncoder.js';
import { Signature } from '../sign/Signature.js';
import { SigningService } from '../sign/SigningService.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Interface representing the JSON structure of an Authenticator.
 */
export interface IAuthenticatorJson {
  /** The public key as a hex string. */
  publicKey: string;
  /** The signature algorithm used. */
  algorithm: string;
  /** The signature as a hex string. */
  signature: string;
  /** The state hash as a hex string. */
  stateHash: string;
}

/**
 * Represents an Authenticator for signing and verifying transactions.
 */
export class Authenticator {
  /**
   * Constructs an Authenticator instance.
   * @param algorithm The signature algorithm used.
   * @param _publicKey The public key as a Uint8Array.
   * @param signature The signature object.
   * @param stateHash The state hash object.
   */
  public constructor(
    public readonly algorithm: string,
    private readonly _publicKey: Uint8Array,
    public readonly signature: Signature,
    public readonly stateHash: DataHash,
  ) {
    this._publicKey = new Uint8Array(_publicKey);
  }

  /**
   * Gets a copy of the public key.
   * @returns The public key as a Uint8Array.
   */
  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  /**
   * Creates an Authenticator by signing a transaction hash.
   * @param signingService The signing service to use.
   * @param transactionHash The transaction hash to sign.
   * @param stateHash The state hash.
   * @returns A Promise resolving to an Authenticator instance.
   */
  public static async create(
    signingService: SigningService,
    transactionHash: DataHash,
    stateHash: DataHash,
  ): Promise<Authenticator> {
    return new Authenticator(
      signingService.algorithm,
      signingService.publicKey,
      await signingService.sign(transactionHash),
      stateHash,
    );
  }

  /**
   * Creates an Authenticator from a JSON object.
   * @param data The JSON data.
   * @returns An Authenticator instance.
   * @throws Error if parsing fails.
   */
  public static fromJSON(data: unknown): Authenticator {
    if (!Authenticator.isJSON(data)) {
      throw new Error('Parsing authenticator dto failed.');
    }

    return new Authenticator(
      data.algorithm,
      HexConverter.decode(data.publicKey),
      Signature.fromJSON(data.signature),
      DataHash.fromJSON(data.stateHash),
    );
  }

  /**
   * Type guard to check if data is IAuthenticatorJson.
   * @param data The data to check.
   * @returns True if data is IAuthenticatorJson, false otherwise.
   */
  public static isJSON(data: unknown): data is IAuthenticatorJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'publicKey' in data &&
      typeof data.publicKey === 'string' &&
      'algorithm' in data &&
      typeof data.algorithm === 'string' &&
      'signature' in data &&
      typeof data.signature === 'string' &&
      'stateHash' in data &&
      typeof data.stateHash === 'string'
    );
  }

  /**
   * Decodes an Authenticator from CBOR bytes.
   * @param bytes The CBOR-encoded bytes.
   * @returns An Authenticator instance.
   */
  public static fromCBOR(bytes: Uint8Array): Authenticator {
    const data = CborDecoder.readArray(bytes);
    return new Authenticator(
      CborDecoder.readTextString(data[0]),
      CborDecoder.readByteString(data[1]),
      Signature.decode(CborDecoder.readByteString(data[2])),
      DataHash.fromImprint(CborDecoder.readByteString(data[3])),
    );
  }

  /**
   * Encodes the Authenticator to CBOR format.
   * @returns The CBOR-encoded bytes.
   */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeTextString(this.algorithm),
      CborEncoder.encodeByteString(this.publicKey),
      CborEncoder.encodeByteString(this.signature.encode()),
      CborEncoder.encodeByteString(this.stateHash.imprint),
    ]);
  }

  /**
   * Converts the Authenticator to a JSON object.
   * @returns The Authenticator as IAuthenticatorJson.
   */
  public toJSON(): IAuthenticatorJson {
    return {
      algorithm: this.algorithm,
      publicKey: HexConverter.encode(this.publicKey),
      signature: this.signature.toJSON(),
      stateHash: this.stateHash.toJSON(),
    };
  }

  /**
   * Verifies the signature for a given transaction hash.
   * @param transactionHash The transaction hash to verify.
   * @returns A Promise resolving to true if valid, false otherwise.
   */
  public verify(transactionHash: DataHash): Promise<boolean> {
    return SigningService.verifyWithPublicKey(transactionHash, this.signature.bytes, this.publicKey);
  }

  /**
   * Calculates the request ID for this Authenticator.
   * @returns A Promise resolving to a RequestId.
   */
  public calculateRequestId(): Promise<RequestId> {
    return RequestId.create(this._publicKey, this.stateHash);
  }

  /**
   * Returns a string representation of the Authenticator.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Authenticator
        Public Key: ${HexConverter.encode(this._publicKey)}
        Signature Algorithm: ${this.algorithm}
        Signature: ${this.signature.toString()}
        State Hash: ${this.stateHash.toString()}`;
  }
}
