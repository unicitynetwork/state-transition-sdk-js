import { secp256k1 } from '@noble/curves/secp256k1.js';

import { Signature } from './Signature.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';
import { DataHash } from '../hash/DataHash.js';
import { ISignatureVerifier } from '../ISignatureVerifier.js';

/**
 * secp256k1 signature verification.
 *
 * Verification here *is* one key recovery: the key selected by `(r, s)` and the recovery byte over `hash` is compared
 * with the expected key. A signature is accepted only if that recovered key is the expected one, so the recovery byte is
 * bound to the trusted key and a tampered recovery byte fails, with no separate verification. (A different recovery byte
 * selects a different key; it is not "the only key under which the signature verifies".) This is one recovery
 * calculation, not one elementary EC operation, and it is the formulation the other SDKs adopt (arch-o3.md §4).
 *
 * Recovery, unlike `secp256k1.verify` (noble applies `lowS: true` by default),
 * accepts malleable high-s signatures, so the low-s policy is applied
 * explicitly and behaviour is unchanged.
 */
export class Secp256k1SignatureVerifier implements ISignatureVerifier<Signature> {
  public readonly algorithm: string = 'secp256k1';

  /**
   * @inheritDoc
   */
  public verify(hash: DataHash, signature: Signature, publicKey: Uint8Array): Promise<boolean> {
    try {
      const recoverable = secp256k1.Signature.fromBytes(
        new Uint8Array([signature.recovery, ...signature.bytes]),
        'recovered',
      );
      if (recoverable.hasHighS()) {
        return Promise.resolve(false);
      }

      return Promise.resolve(
        areUint8ArraysEqual(new Uint8Array(publicKey), recoverable.recoverPublicKey(hash.data).toBytes()),
      );
    } catch {
      return Promise.resolve(false);
    }
  }
}
