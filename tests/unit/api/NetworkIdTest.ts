import { NetworkId } from '../../../src/api/NetworkId.js';

describe('NetworkId', () => {
  it('names the live networks: mainnet 1, testnet2 4, local 3', () => {
    expect(NetworkId.MAINNET.id).toBe(1);
    expect(NetworkId.TESTNET2.id).toBe(4);
    expect(NetworkId.LOCAL.id).toBe(3);
    expect(NetworkId.fromId(4)).toBe(NetworkId.TESTNET2);
    expect(NetworkId.fromId(1n)).toBe(NetworkId.MAINNET);
    expect(NetworkId.fromId(3)).toBe(NetworkId.LOCAL);
    expect(String(NetworkId.TESTNET2)).toBe('NetworkId[TESTNET2]');
  });

  it('has no name for network 2, the old testnet, so it cannot be picked by name; the id is still valid', () => {
    expect('TESTNET' in NetworkId).toBe(false);
    const removed = NetworkId.fromId(2);
    expect(removed.id).toBe(2);
    expect(String(removed)).toBe('NetworkId[2]');
    expect(removed.equals(NetworkId.TESTNET2)).toBe(false);
  });

  it('accepts any id of the 16-bit range and nothing else', () => {
    expect(NetworkId.fromId(65535).id).toBe(65535);
    expect(() => NetworkId.fromId(0)).toThrow();
    expect(() => NetworkId.fromId(65536)).toThrow();
  });
});
