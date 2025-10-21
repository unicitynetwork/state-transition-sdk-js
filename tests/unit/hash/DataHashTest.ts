import { DataHash } from '../../../src/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('Data hash', () => {
  it('should use encode and decode correctly', () => {
    const hash = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32));
    expect(hash.toJSON()).toEqual('00000000000000000000000000000000000000000000000000000000000000000000');
    expect(DataHash.fromJSON('00010000000000000000000000000000000000000000000000000000000000000000')).toEqual({
      _data: new Uint8Array(32),
      _imprint: new Uint8Array([0x00, 0x01, ...new Uint8Array(32)]),
      algorithm: HashAlgorithm.SHA224,
    });
    expect(DataHash.fromImprint(hash.imprint)).toEqual(hash);

    expect(HexConverter.encode(hash.toCBOR())).toEqual(
      '582200000000000000000000000000000000000000000000000000000000000000000000',
    );
    expect(
      DataHash.fromCBOR(
        HexConverter.decode('582200010000000000000000000000000000000000000000000000000000000000000000'),
      ),
    ).toEqual({
      _data: new Uint8Array(32),
      _imprint: new Uint8Array([0x00, 0x01, ...new Uint8Array(32)]),
      algorithm: HashAlgorithm.SHA224,
    });

    expect(new DataHash(0b11111111111 as HashAlgorithm, new Uint8Array(32)).toJSON()).toStrictEqual(
      '07ff0000000000000000000000000000000000000000000000000000000000000000',
    );
  });
});
