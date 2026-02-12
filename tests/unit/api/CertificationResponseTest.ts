import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { InvalidJsonStructureError } from '../../../src/InvalidJsonStructureError.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';

describe('CertificationResponse', () => {
  it('should encode and decode JSON to exactly same object', async () => {
    // Test simple success response without receipt
    let response = CertificationResponse.fromJSON(CertificationResponse.create(CertificationStatus.SUCCESS).toJSON());

    expect(response.status).toBe(CertificationStatus.SUCCESS);
    expect(response.receipt).toBeNull();

    // Test error response without receipt
    response = CertificationResponse.fromJSON(
      CertificationResponse.create(CertificationStatus.INVALID_PUBLIC_KEY_FORMAT).toJSON(),
    );

    expect(response.status).toBe(CertificationStatus.INVALID_PUBLIC_KEY_FORMAT);
    expect(response.receipt).toBeNull();

    // Test response with all fields
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );

    response = await CertificationResponse.createWithReceipt(
      signingService,
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
      CertificationStatus.SUCCESS,
    );

    const signature = response.receipt?.signature;

    response = CertificationResponse.fromJSON(response.toJSON());

    expect(response.toJSON()).toEqual({
      receipt: {
        publicKey: HexConverter.encode(signingService.publicKey),
        signature: signature?.toJSON(),
      },
      status: CertificationStatus.SUCCESS,
    });
  });

  it('should validate JSON structure correctly', () => {
    // Invalid JSON structures
    expect(CertificationResponse.isJSON(null)).toBe(false);
    expect(CertificationResponse.isJSON(undefined)).toBe(false);
    expect(CertificationResponse.isJSON('string')).toBe(false);
    expect(CertificationResponse.isJSON(123)).toBe(false);
    expect(CertificationResponse.isJSON({})).toBe(false);
    expect(CertificationResponse.isJSON({ status: 123 })).toBe(false);
  });

  it('should handle fromJSON errors correctly', () => {
    // Test error thrown for invalid JSON
    expect(() => CertificationResponse.fromJSON({})).toThrow(InvalidJsonStructureError);
    expect(() => CertificationResponse.fromJSON(null)).toThrow(InvalidJsonStructureError);
    expect(() => CertificationResponse.fromJSON({ status: 123 })).toThrow(InvalidJsonStructureError);
  });

  it('should verify receipt correctly', async () => {
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );

    const certificationData = CertificationData.fromCBOR(
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
    );
    let response = await CertificationResponse.createWithReceipt(
      signingService,
      certificationData,
      CertificationStatus.SUCCESS,
    );

    await expect(response.verifyReceipt(certificationData)).resolves.toBe(true);

    // Test that JSON serialization and deserialization preserves verification
    response = CertificationResponse.fromJSON(response.toJSON());
    await expect(response.verifyReceipt(certificationData)).resolves.toBe(true);

    // Test with wrong signature should fail verification
    const invalidCertificationData = CertificationData.fromCBOR(
      CborSerializer.encodeArray(
        HexConverter.decode('8301410158210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
        CborSerializer.encodeByteString(new Uint8Array(32)),
        CborSerializer.encodeByteString(new Uint8Array(32)),
        CborSerializer.encodeByteString(
          HexConverter.decode(
            '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a00',
          ),
        ),
      ),
    );

    await expect(response.verifyReceipt(invalidCertificationData)).resolves.toBe(false);

    // Test responses without receipt should fail verification
    response = CertificationResponse.create(CertificationStatus.SUCCESS);
    await expect(() => response.verifyReceipt(certificationData)).rejects.toThrow(
      'Receipt is not part of the response.',
    );
  });
});
