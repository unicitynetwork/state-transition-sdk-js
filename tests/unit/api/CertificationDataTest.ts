import { CertificationData } from '../../../src/api/CertificationData.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('CertificationData', () => {
  it('should encode and decode to exactly same object', async () => {
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );
    const certificationData = await CertificationData.create(
      DataHash.fromImprint(new Uint8Array(34)),
      DataHash.fromImprint(new Uint8Array(34)),
      signingService,
    );
    expect(HexConverter.encode(certificationData.toCBOR())).toStrictEqual(
      '8458210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179858220000000000000000000000000000000000000000000000000000000000000000000058220000000000000000000000000000000000000000000000000000000000000000000058418c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
    );
    expect(CertificationData.fromCBOR(certificationData.toCBOR())).toStrictEqual(certificationData);
    expect(certificationData.toJSON()).toEqual({
      publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      signature:
        '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      stateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
    });
    expect(CertificationData.fromJSON(certificationData.toJSON())).toStrictEqual(certificationData);
  });

  it('certification data should succeed on correct signature', async () => {
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );

    const certificationData = await CertificationData.create(
      DataHash.fromImprint(new Uint8Array(34)),
      DataHash.fromImprint(new Uint8Array(34)),
      signingService,
    );

    await expect(certificationData.verify()).resolves.toBeTruthy();
  });

  it('certification data should fail on incorrect signature', async () => {
    const certificationData = CertificationData.fromJSON({
      publicKey: '032044f2cd28867f57ace2b3fd1437b775df8dd62ea0acf0e1fc43cc846c1a05e1',
      signature:
        '416751e864ba85250091e4fcd1b728850e7d1ea757ad4f297a29b018182ff4dd1f25982aede58e56d9163cc6ab36b3433bfe34d1cec41bdb03d9e31b87619b1f00',
      stateHash: '0000cd6065a0f1d503113f443505fd7981e6096e8f5b725501c00379e8eb74055648',
      transactionHash: '00008a51b5b84171e6c7c345bf3610cc18fa1b61bad33908e1522520c001b0e7fd1d',
    });

    await expect(certificationData.verify()).resolves.toBeFalsy();
  });
});
