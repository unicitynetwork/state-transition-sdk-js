import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { InvalidJsonStructureError } from '../../../src/InvalidJsonStructureError.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

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
      await CertificationData.create(
        DataHash.fromImprint(new Uint8Array(34)),
        DataHash.fromImprint(new Uint8Array(34)),
        signingService,
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

    const certificationData = await CertificationData.create(
      DataHash.fromImprint(new Uint8Array(34)),
      DataHash.fromImprint(new Uint8Array(34)),
      signingService,
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
    const invalidCertificationData = await CertificationData.create(
      DataHash.fromImprint(new Uint8Array(34)),
      DataHash.fromImprint(new Uint8Array(34)),
      new SigningService(
        new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000002')),
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
