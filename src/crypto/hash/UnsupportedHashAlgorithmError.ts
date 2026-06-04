import { HashAlgorithm } from './HashAlgorithm.js';

/**
 * Thrown when a hasher implementation is asked to use a {@link HashAlgorithm}
 * it does not support (e.g. Web Crypto cannot do RIPEMD-160).
 */
export class UnsupportedHashAlgorithmError extends Error {
  public constructor(algorithm: HashAlgorithm) {
    super(`Unsupported hash algorithm: ${algorithm.name}`);

    this.name = 'UnsupportedHashAlgorithm';
  }
}
