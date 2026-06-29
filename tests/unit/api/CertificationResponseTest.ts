import { CertificationResponse, CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { InvalidJsonStructureError } from '../../../src/serialization/json/InvalidJsonStructureError.js';

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
    expect(() => CertificationResponse.fromJSON({ status: '' })).toThrow(InvalidJsonStructureError);
  });

  it('should tolerate status strings unknown to this SDK version', () => {
    // An aggregator may emit statuses this SDK version does not know (older deployments emitting
    // since-removed statuses, or statuses added later). Parsing must not throw; callers treat an
    // unknown status as "not accepted" and probe the inclusion proof instead.
    expect(CertificationResponse.isJSON({ status: 'STATE_ID_EXISTS' })).toBe(true);

    const response = CertificationResponse.fromJSON({ status: 'STATE_ID_EXISTS' });
    expect(response.status).toBe('STATE_ID_EXISTS');
    expect(response.status).not.toBe(CertificationStatus.SUCCESS);

    // Round-trips through JSON unchanged.
    expect(CertificationResponse.fromJSON(response.toJSON()).status).toBe('STATE_ID_EXISTS');
  });
});
