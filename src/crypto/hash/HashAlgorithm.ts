import { HashError } from './HashError.js';

export class HashAlgorithm {
  public static readonly RIPEMD160 = new HashAlgorithm(4, 'RIPEMD-160', 20);
  public static readonly SHA224 = new HashAlgorithm(1, 'SHA-224', 28);
  public static readonly SHA256 = new HashAlgorithm(0, 'SHA-256', 32);
  public static readonly SHA384 = new HashAlgorithm(2, 'SHA-384', 48);
  public static readonly SHA512 = new HashAlgorithm(3, 'SHA-512', 64);

  private constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly length: number,
  ) {}

  public static fromId(id: number): HashAlgorithm {
    switch (id) {
      case HashAlgorithm.SHA256.id:
        return HashAlgorithm.SHA256;
      case HashAlgorithm.SHA224.id:
        return HashAlgorithm.SHA224;
      case HashAlgorithm.SHA384.id:
        return HashAlgorithm.SHA384;
      case HashAlgorithm.SHA512.id:
        return HashAlgorithm.SHA512;
      case HashAlgorithm.RIPEMD160.id:
        return HashAlgorithm.RIPEMD160;
      default:
        throw new HashError(`Unsupported hash algorithm ID: ${id}`);
    }
  }

  public toString(): string {
    return this.name;
  }
}
