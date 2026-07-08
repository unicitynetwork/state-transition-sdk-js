import { TokenSalt } from '../../../src/transaction/TokenSalt.js';

describe('TokenSalt', () => {
  it('should reject a salt shorter than the minimum length', () => {
    expect(() => TokenSalt.fromBytes(new Uint8Array(TokenSalt.MIN_LENGTH - 1))).toThrow();
  });

  it('should accept a salt at the minimum length', () => {
    expect(() => TokenSalt.fromBytes(new Uint8Array(TokenSalt.MIN_LENGTH))).not.toThrow();
  });

  it('should accept a salt longer than the default length', () => {
    expect(TokenSalt.fromBytes(new Uint8Array(64)).toBytes()).toHaveLength(64);
  });

  it('should generate a default-length salt', () => {
    expect(TokenSalt.generate().toBytes()).toHaveLength(TokenSalt.LENGTH);
  });
});
