import { Authenticator } from '../../../src/api/Authenticator.js';
import { RequestId } from '../../../src/api/RequestId.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { Signature } from '../../../src/sign/Signature.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('Authenticator', () => {
  it('should encode and decode to exactly same object', () => {
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );
    const authenticator = new Authenticator(
      'secp256k1',
      signingService.publicKey,
      Signature.fromJSON(
        'A0B37F8FBA683CC68F6574CD43B39F0343A50008BF6CCEA9D13231D9E7E2E1E411EDC8D307254296264AEBFC3DC76CD8B668373A072FD64665B50000E9FCCE5201',
      ),
      DataHash.fromImprint(new Uint8Array(34)),
    );
    expect(HexConverter.encode(authenticator.toCBOR())).toStrictEqual(
      '8469736563703235366b3158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817985841a0b37f8fba683cc68f6574cd43b39f0343a50008bf6ccea9d13231d9e7e2e1e411edc8d307254296264aebfc3dc76cd8b668373a072fd64665b50000e9fcce5201582200000000000000000000000000000000000000000000000000000000000000000000',
    );
    expect(Authenticator.fromCBOR(authenticator.toCBOR())).toStrictEqual(authenticator);
    expect(authenticator.toJSON()).toEqual({
      algorithm: 'secp256k1',
      publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      signature:
        'a0b37f8fba683cc68f6574cd43b39f0343a50008bf6ccea9d13231d9e7e2e1e411edc8d307254296264aebfc3dc76cd8b668373a072fd64665b50000e9fcce5201',
      stateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
    });
    expect(Authenticator.fromJSON(authenticator.toJSON())).toStrictEqual(authenticator);
  });

  it('should calculate request id', async () => {
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );
    const authenticator = new Authenticator(
      'secp256k1',
      signingService.publicKey,
      await signingService.sign(DataHash.fromImprint(new Uint8Array(34))),
      DataHash.fromImprint(new Uint8Array(34)),
    );

    const requestId = await RequestId.create(signingService.publicKey, DataHash.fromImprint(new Uint8Array(34)));
    expect(requestId.equals(await authenticator.calculateRequestId())).toBeTruthy();
  });

  it('signed tx hash imprint must fail verification', async () => {
    const requestId: RequestId = RequestId.fromJSON(
      '0000cfe84a1828e2edd0a7d9533b23e519f746069a938d549a150e07e14dc0f9cf00',
    );
    const transactionHash: DataHash = DataHash.fromJSON(
      '00008a51b5b84171e6c7c345bf3610cc18fa1b61bad33908e1522520c001b0e7fd1d',
    );
    const authenticator: Authenticator = new Authenticator(
      'secp256k1',
      HexConverter.decode('032044f2cd28867f57ace2b3fd1437b775df8dd62ea0acf0e1fc43cc846c1a05e1'),
      Signature.fromJSON(
        '416751e864ba85250091e4fcd1b728850e7d1ea757ad4f297a29b018182ff4dd1f25982aede58e56d9163cc6ab36b3433bfe34d1cec41bdb03d9e31b87619b1f00',
      ),
      DataHash.fromJSON('0000cd6065a0f1d503113f443505fd7981e6096e8f5b725501c00379e8eb74055648'),
    );

    expect(requestId.equals(await authenticator.calculateRequestId())).toBeTruthy();
    expect(await authenticator.verify(transactionHash)).toBeFalsy();
  });
});
