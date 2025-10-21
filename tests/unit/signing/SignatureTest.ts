import { DataHash } from '../../../src/hash/DataHash.js';
import { Signature } from '../../../src/sign/Signature.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('Signature', () => {
  it('should encode and decode to exactly same object', async () => {
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );
    const signature = await signingService.sign(DataHash.fromImprint(new Uint8Array(34)));
    expect(HexConverter.encode(signature.toCBOR())).toStrictEqual(
      '5841a0b37f8fba683cc68f6574cd43b39f0343a50008bf6ccea9d13231d9e7e2e1e411edc8d307254296264aebfc3dc76cd8b668373a072fd64665b50000e9fcce5201',
    );
    expect(Signature.fromCBOR(signature.toCBOR())).toStrictEqual(signature);
    expect(signature.toJSON()).toStrictEqual(
      'a0b37f8fba683cc68f6574cd43b39f0343a50008bf6ccea9d13231d9e7e2e1e411edc8d307254296264aebfc3dc76cd8b668373a072fd64665b50000e9fcce5201',
    );
    expect(Signature.fromJSON(signature.toJSON())).toStrictEqual(signature);
  });
});
