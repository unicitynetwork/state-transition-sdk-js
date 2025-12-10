import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationRequest } from '../../../src/api/CertificationRequest.js';

describe('CertificationRequest', () => {
  it('should encode and decode JSON to exactly same object', async () => {
    let request = await CertificationRequest.create(
      CertificationData.fromJSON({
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      }),
    );

    expect(request.toJSON()).toEqual({
      certificationData: {
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      },
      receipt: undefined,
      stateId: '0000b2c378222042c0c8a6970a97df93e95e6038ad664f6e137aeea6bb00cb00e5ca',
    });

    request = await CertificationRequest.create(
      CertificationData.fromJSON({
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      }),
      true,
    );

    expect(request.toJSON()).toEqual({
      certificationData: {
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      },
      receipt: true,
      stateId: '0000b2c378222042c0c8a6970a97df93e95e6038ad664f6e137aeea6bb00cb00e5ca',
    });
  });
});
