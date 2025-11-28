import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationRequest } from '../../../src/api/CertificationRequest.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('CertificationRequest', () => {
  it('should encode and decode JSON to exactly same object', async () => {
    // Create test data
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );

    let request = await CertificationRequest.create(
      await CertificationData.create(
        DataHash.fromImprint(new Uint8Array(34)),
        DataHash.fromImprint(new Uint8Array(34)),
        signingService,
      ),
    );

    expect(request.toJSON()).toEqual({
      data: {
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
        stateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      },
      receipt: undefined,
      stateId: '00006125902a1b710488f59988ba737c44e33d69e49c2e9ab8e51146b19fc867125e',
    });

    request = await CertificationRequest.create(
      await CertificationData.create(
        DataHash.fromImprint(new Uint8Array(34)),
        DataHash.fromImprint(new Uint8Array(34)),
        signingService,
      ),
      true,
    );

    expect(request.toJSON()).toEqual({
      data: {
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
        stateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      },
      receipt: true,
      stateId: '00006125902a1b710488f59988ba737c44e33d69e49c2e9ab8e51146b19fc867125e',
    });
  });
});
