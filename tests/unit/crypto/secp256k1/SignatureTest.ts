import { Signature } from '../../../../src/crypto/secp256k1/Signature.js';

describe('Signature', () => {
  const sigBytes = (recovery: number): Uint8Array => {
    const bytes = new Uint8Array(65);
    bytes[64] = recovery;
    return bytes;
  };

  it('should reject a recovery id out of range', () => {
    expect(() => Signature.decode(sigBytes(4))).toThrow('Invalid signature recovery id');
    expect(() => Signature.decode(sigBytes(255))).toThrow('Invalid signature recovery id');
  });

  it('should accept recovery ids 0 through 3', () => {
    expect(Signature.decode(sigBytes(0)).recovery).toBe(0);
    expect(Signature.decode(sigBytes(1)).recovery).toBe(1);
    expect(Signature.decode(sigBytes(2)).recovery).toBe(2);
    expect(Signature.decode(sigBytes(3)).recovery).toBe(3);
  });

  it('should reject input that is not 65 bytes', () => {
    expect(() => Signature.decode(new Uint8Array(64))).toThrow('Signature must contain');
  });
});
