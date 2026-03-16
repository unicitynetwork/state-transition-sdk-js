import { CertificationResponse, CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { InvalidJsonStructureError } from '../../../src/InvalidJsonStructureError.js';

describe('CertificationResponse', () => {
  it('should encode and decode JSON to exactly same object', () => {
    let response = CertificationResponse.fromJSON(CertificationResponse.create(CertificationStatus.SUCCESS).toJSON());

    expect(response.status).toBe(CertificationStatus.SUCCESS);

    // Test error response without receipt
    response = CertificationResponse.fromJSON(
      CertificationResponse.create(CertificationStatus.INVALID_PUBLIC_KEY_FORMAT).toJSON(),
    );

    expect(response.status).toBe(CertificationStatus.INVALID_PUBLIC_KEY_FORMAT);
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
});
