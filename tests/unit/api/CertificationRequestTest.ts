import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationRequest } from '../../../src/api/CertificationRequest.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';

describe('CertificationRequest', () => {
  it('should encode and decode CBOR to exactly same object', async () => {
    let request = await CertificationRequest.create(
      CertificationData.fromCBOR(
        CborSerializer.encodeArray(
          HexConverter.decode('8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
          CborSerializer.encodeByteString(new Uint8Array(32)),
          CborSerializer.encodeByteString(new Uint8Array(32)),
          CborSerializer.encodeByteString(
            HexConverter.decode(
              '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
            ),
          ),
        ),
      ),
    );

    expect(HexConverter.encode(request.toCBOR())).toEqual(
      '8458207191bb9f044715f712ca5e77e91b585cf892eb5755ae4d77231ad429c53cf661848301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798582000000000000000000000000000000000000000000000000000000000000000005820000000000000000000000000000000000000000000000000000000000000000058418c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01f400',
    );

    request = await CertificationRequest.create(
      CertificationData.fromCBOR(
        CborSerializer.encodeArray(
          HexConverter.decode('8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
          CborSerializer.encodeByteString(new Uint8Array(32)),
          CborSerializer.encodeByteString(new Uint8Array(32)),
          CborSerializer.encodeByteString(
            HexConverter.decode(
              '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
            ),
          ),
        ),
      ),
      true,
    );

    expect(HexConverter.encode(request.toCBOR())).toEqual(
      '8458207191bb9f044715f712ca5e77e91b585cf892eb5755ae4d77231ad429c53cf661848301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798582000000000000000000000000000000000000000000000000000000000000000005820000000000000000000000000000000000000000000000000000000000000000058418c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01f500',
    );
  });
});
