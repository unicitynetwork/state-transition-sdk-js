import { AggregatorClient } from '../../../src/api/AggregatorClient.js';

describe('AggregatorClient', () => {
  it('should reject an API key over plaintext HTTP', () => {
    expect(() => new AggregatorClient('http://example.com', 'secret-key')).toThrow();
  });

  it('should allow an API key over HTTPS', () => {
    expect(() => new AggregatorClient('https://example.com', 'secret-key')).not.toThrow();
  });

  it('should allow a plaintext HTTP URL when no API key is set', () => {
    expect(() => new AggregatorClient('http://example.com')).not.toThrow();
  });

  it('should not expose the API key on inspection', () => {
    const client = new AggregatorClient('https://example.com', 'secret-key');

    expect(JSON.stringify(client)).not.toContain('secret-key');
    expect(Object.keys(client)).not.toContain('key');
    expect(Object.values(client)).not.toContain('secret-key');
  });
});
