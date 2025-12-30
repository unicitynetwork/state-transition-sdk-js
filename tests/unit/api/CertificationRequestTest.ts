import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationRequest } from '../../../src/api/CertificationRequest.js';

describe('CertificationRequest', () => {
  it('should encode and decode JSON to exactly same object', async () => {
    let request = await CertificationRequest.create(
      CertificationData.fromJSON({
        ownerPredicate: '8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        witness:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      }),
    );

    expect(request.toJSON()).toEqual({
      certificationData: {
        ownerPredicate: '8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        witness:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      },
      receipt: undefined,
      stateId: '00009f1f251d01c1156504159d56d403fc96d7b2458a9477ec47fc48679a40bb4bd5',
    });

    request = await CertificationRequest.create(
      CertificationData.fromJSON({
        ownerPredicate: '8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        witness:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      }),
      true,
    );

    expect(request.toJSON()).toEqual({
      certificationData: {
        ownerPredicate: '8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
        witness:
          '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      },
      receipt: true,
      stateId: '00009f1f251d01c1156504159d56d403fc96d7b2458a9477ec47fc48679a40bb4bd5',
    });
  });
});
