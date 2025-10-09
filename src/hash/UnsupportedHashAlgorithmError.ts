import { HashAlgorithm } from './HashAlgorithm.js';

export class UnsupportedHashAlgorithmError extends Error {
  public constructor(algorithm: HashAlgorithm) {
    super(`Unsupported hash algorithm: ${algorithm}`);

    this.name = 'UnsupportedHashAlgorithm';
  }
}
