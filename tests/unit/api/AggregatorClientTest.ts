import { readFileSync } from 'node:fs';

import { AggregatorClient, SDK_VERSION_HEADER } from '../../../src/api/AggregatorClient.js';
import { JsonRpcNetworkError } from '../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { JsonRpcResponseError } from '../../../src/api/json-rpc/JsonRpcResponseError.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { SDK_VERSION } from '../../../src/SdkVersion.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';

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

  it('should allow an API key over plaintext HTTP when insecure transport is enabled', () => {
    expect(() => new AggregatorClient('http://localhost:3000', 'secret-key', true)).not.toThrow();
  });

  it('should forward the abort signal of an inclusion proof request to fetch', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    try {
      const client = new AggregatorClient('https://example.com');
      const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32)));
      const controller = new AbortController();

      await expect(client.getInclusionProof(stateId, { signal: controller.signal })).rejects.toThrow();
      expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('should not expose the API key on inspection', () => {
    const client = new AggregatorClient('https://example.com', 'secret-key');

    expect(JSON.stringify(client)).not.toContain('secret-key');
    expect(Object.keys(client)).not.toContain('key');
    expect(Object.values(client)).not.toContain('secret-key');
  });

  describe('getTrustBasePage', () => {
    const request = { fromEpoch: 4n, maxEntries: 16, network: NetworkId.LOCAL, snapshot: null };

    const withFetch = async (
      response: Response,
      run: (fetchMock: jest.SpiedFunction<typeof fetch>) => Promise<void>,
    ): Promise<void> => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
      try {
        await run(fetchMock);
      } finally {
        fetchMock.mockRestore();
      }
    };

    it('asks the origin of the aggregator, whatever the JSON-RPC path, and returns the body bytes undecoded', async () => {
      await withFetch(new Response(new Uint8Array([1, 2, 3])), async (fetchMock) => {
        const client = new AggregatorClient('https://example.com/some/rpc/path');
        await expect(client.getTrustBasePage(request)).resolves.toEqual(new Uint8Array([1, 2, 3]));
        const url = fetchMock.mock.calls[0][0] as URL;
        expect(url.origin + url.pathname).toBe('https://example.com/api/v1/trustbases');
        expect(url.searchParams.get('from')).toBe('4');
        expect(url.searchParams.get('maxEntries')).toBe('16');
        expect(url.searchParams.has('snapshotEnd')).toBe(false);
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('GET');
        expect(init.redirect).toBe('error');
        expect(new Headers(init.headers).get('Accept')).toBe('application/cbor');
      });
    });

    it('echoes the snapshot and sends the API key', async () => {
      await withFetch(new Response(new Uint8Array(0)), async (fetchMock) => {
        const client = new AggregatorClient('https://example.com', 'secret-key');
        await client.getTrustBasePage({ ...request, snapshot: { end: 9n, entryId: new Uint8Array(32).fill(0xab) } });
        const url = fetchMock.mock.calls[0][0] as URL;
        expect(url.searchParams.get('snapshotEnd')).toBe('9');
        expect(url.searchParams.get('snapshotEntryId')).toBe(`0x${'ab'.repeat(32)}`);
        expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('X-API-Key')).toBe('secret-key');
      });
    });

    it('carries the SDK version header', async () => {
      await withFetch(new Response(new Uint8Array(0)), async (fetchMock) => {
        await new AggregatorClient('https://example.com').getTrustBasePage(request);
        expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get(SDK_VERSION_HEADER)).toBe(
          `js/${SDK_VERSION}`,
        );
      });
    });

    it('forwards the abort signal', async () => {
      await withFetch(new Response(new Uint8Array(0)), async (fetchMock) => {
        const controller = new AbortController();
        await new AggregatorClient('https://example.com').getTrustBasePage(request, { signal: controller.signal });
        expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
      });
    });

    it('throws the HTTP status of a refused query', async () => {
      await withFetch(new Response('bad query', { status: 400 }), async () => {
        const error: unknown = await new AggregatorClient('https://example.com')
          .getTrustBasePage(request)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(JsonRpcNetworkError);
        expect((error as JsonRpcNetworkError).status).toBe(400);
      });
    });

    it('refuses a body above the page cap before holding it', async () => {
      await withFetch(new Response(new Uint8Array(AggregatorClient.MAX_TRUST_BASE_RESPONSE_BYTES + 1)), async () => {
        await expect(new AggregatorClient('https://example.com').getTrustBasePage(request)).rejects.toBeInstanceOf(
          JsonRpcResponseError,
        );
      });
    });
  });

  describe('SDK version header', () => {
    const sentHeaders = async (client: AggregatorClient): Promise<Headers> => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      try {
        await expect(client.getLatestBlockNumber()).rejects.toThrow();
        return new Headers(fetchMock.mock.calls[0][1]?.headers);
      } finally {
        fetchMock.mockRestore();
      }
    };

    it('equals the package version', () => {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
      expect(SDK_VERSION).toBe(pkg.version);
    });

    it('is sent by default outside a browser', async () => {
      const headers = await sentHeaders(new AggregatorClient('https://example.com'));
      expect(headers.get(SDK_VERSION_HEADER)).toBe(`js/${SDK_VERSION}`);
    });

    it('is sent on an inclusion proof request as well', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      try {
        const client = new AggregatorClient('https://example.com', 'k');
        const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32)));
        await expect(client.getInclusionProof(stateId)).rejects.toThrow();
        const seen = new Headers(fetchMock.mock.calls[0][1]?.headers);
        expect(seen.get(SDK_VERSION_HEADER)).toBe(`js/${SDK_VERSION}`);
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('is not sent when switched off', async () => {
      const headers = await sentHeaders(
        new AggregatorClient('https://example.com', null, false, { sdkVersionHeader: false }),
      );
      expect(headers.has(SDK_VERSION_HEADER)).toBe(false);
    });

    it('can be a custom string', async () => {
      const headers = await sentHeaders(
        new AggregatorClient('https://example.com', null, false, { sdkVersionHeader: 'wallet/7' }),
      );
      expect(headers.get(SDK_VERSION_HEADER)).toBe('wallet/7');
    });

    it('rejects a value that is not printable ASCII', () => {
      expect(() => new AggregatorClient('https://example.com', null, false, { sdkVersionHeader: 'a\nb' })).toThrow(
        /printable ASCII/,
      );
      expect(() => new AggregatorClient('https://example.com', null, false, { sdkVersionHeader: '' })).toThrow(
        /printable ASCII/,
      );
    });

    it('is off by default in a worker (no window, no Node or Deno globals) and on when asked', async () => {
      const g = globalThis as unknown as { process?: unknown };
      const saved = g.process;
      g.process = undefined;
      try {
        expect((await sentHeaders(new AggregatorClient('https://example.com'))).has(SDK_VERSION_HEADER)).toBe(false);
        const on = await sentHeaders(
          new AggregatorClient('https://example.com', null, false, { sdkVersionHeader: true }),
        );
        expect(on.get(SDK_VERSION_HEADER)).toBe(`js/${SDK_VERSION}`);
      } finally {
        g.process = saved;
      }
    });

    it('is on by default under Deno', async () => {
      const g = globalThis as unknown as { Deno?: unknown; process?: unknown };
      const saved = g.process;
      g.process = undefined;
      g.Deno = {};
      try {
        expect((await sentHeaders(new AggregatorClient('https://example.com'))).has(SDK_VERSION_HEADER)).toBe(true);
      } finally {
        g.process = saved;
        delete g.Deno;
      }
    });

    it('is off by default in a browser and on when asked', async () => {
      const g = globalThis as unknown as { process?: unknown; window?: unknown };
      const saved = g.process;
      g.process = undefined;
      g.window = { document: {} };
      try {
        expect((await sentHeaders(new AggregatorClient('https://example.com'))).has(SDK_VERSION_HEADER)).toBe(false);
        const on = await sentHeaders(
          new AggregatorClient('https://example.com', null, false, { sdkVersionHeader: true }),
        );
        expect(on.get(SDK_VERSION_HEADER)).toBe(`js/${SDK_VERSION}`);
      } finally {
        g.process = saved;
        delete g.window;
      }
    });
  });
});
