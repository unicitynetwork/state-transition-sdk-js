import { CertificationData } from '../../../src/api/CertificationData.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';

describe('CertificationData', () => {
  it('should encode and decode to exactly same object', () => {
    const certificationData = CertificationData.fromJSON({
      publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      signature:
        '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
    });
    expect(HexConverter.encode(certificationData.toCBOR())).toStrictEqual(
      '8458210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179858220000000000000000000000000000000000000000000000000000000000000000000058220000000000000000000000000000000000000000000000000000000000000000000058418c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
    );
    expect(CertificationData.fromCBOR(certificationData.toCBOR())).toStrictEqual(certificationData);
    expect(certificationData.toJSON()).toEqual({
      publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      signature:
        '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
    });
    expect(CertificationData.fromJSON(certificationData.toJSON())).toStrictEqual(certificationData);
  });
});
