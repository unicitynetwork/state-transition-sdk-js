import { secp256k1 } from '@noble/curves/secp256k1.js';

import { ISigningService } from '../ISigningService.js';
import { Signature } from './Signature.js';
import { DataHash } from '../hash/DataHash.js';

/**
 * Default signing service.
 * @implements {ISigningService}
 */
export class SigningService implements ISigningService<Signature> {
  private readonly _publicKey: Uint8Array;

  /**
   * Signing service constructor.
   * @param {Uint8Array} privateKey private key bytes.
   */
  public constructor(private readonly privateKey: Uint8Array) {
    this.privateKey = new Uint8Array(privateKey);
    this._publicKey = secp256k1.getPublicKey(this.privateKey, true);
  }

  public get algorithm(): string {
    return 'secp256k1';
  }

  /**
   * @see {ISigningService.publicKey}
   */
  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  public static generatePrivateKey(): Uint8Array {
    return secp256k1.utils.randomSecretKey();
  }

  public static verifySignatureWithRecoveredPublicKey(hash: DataHash, signature: Signature): Promise<boolean> {
    const publicKey = secp256k1.Signature.fromBytes(
      new Uint8Array([signature.recovery, ...signature.bytes]),
      'recovered',
    )
      .recoverPublicKey(hash.data)
      .toBytes();
    return SigningService.verifyWithPublicKey(hash, signature.bytes, publicKey);
  }

  /**
   * Verify secp256k1 signature hash.
   * @param {Uint8Array} hash Hash.
   * @param {Uint8Array} signature Signature.
   * @param {Uint8Array} publicKey Public key.
   */
  public static verifyWithPublicKey(hash: DataHash, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    return Promise.resolve(secp256k1.verify(signature, hash.data, publicKey, { format: 'compact', prehash: false }));
  }

  /**
   * @see {ISigningService.sign} 32-byte hash.
   */
  public sign(hash: DataHash): Promise<Signature> {
    const signature = secp256k1.sign(hash.data, this.privateKey, { format: 'recovered', prehash: false });
    return Promise.resolve(new Signature(signature.slice(1), signature[0]));
  }

  /**
   * Verify secp256k1 signature hash.
   * @param {Uint8Array} hash Hash.
   * @param {Uint8Array} signature Signature.
   */
  public verify(hash: DataHash, signature: Signature): Promise<boolean> {
    return SigningService.verifyWithPublicKey(hash, signature.bytes, this._publicKey);
  }
}
