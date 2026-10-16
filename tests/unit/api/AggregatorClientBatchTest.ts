import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { isBatchAggregatorClient } from '../../../src/api/IBatchAggregatorClient.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';

function stateId(fill: number): StateId {
  return StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32).fill(fill)));
}

function respond(result: unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const id = (JSON.parse(init?.body as string) as { id: string }).id;
    return Promise.resolve(new Response(JSON.stringify({ id, jsonrpc: '2.0', ...(result as object) }), { status }));
  });
}

async function failure(promise: Promise<unknown>): Promise<BatchProofError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BatchProofError);
  return error as BatchProofError;
}

describe('AggregatorClient.getInclusionProofs', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('is an optional capability next to the unchanged required interface', () => {
    expect(isBatchAggregatorClient(client)).toBe(true);
    expect(isBatchAggregatorClient({ getInclusionProof: jest.fn(), submitCertificationRequest: jest.fn() })).toBe(
      false,
    );
  });

  it('sends the latest view by default and the exact root when given, with the signal', async () => {
    const world = await ShardedWorld.create(0);
    const batch = await world
      .client('')
      .getInclusionProofs([stateId(1)])
      .catch(() => null);
    expect(batch).toBeNull(); // a state nobody certified is not included: all or nothing

    const fetchMock = respond({ result: { proofs: [] } });
    const calls = fetchMock.mock.calls as [string, { body: string; signal: AbortSignal }][];
    const controller = new AbortController();
    await failure(client.getInclusionProofs([stateId(1)], { signal: controller.signal }));
    const body = JSON.parse(calls[0][1].body) as { method: string; params: unknown };
    expect(body.method).toEqual('get_inclusion_proofs.v1');
    expect(body.params).toEqual({ stateIds: [HexConverter.encode(new Uint8Array(32).fill(1))], stateRoot: 'latest' });
    expect(calls[0][1].signal).toBe(controller.signal);

    fetchMock.mockClear();
    await failure(
      client.getInclusionProofs([stateId(1), stateId(2)], {
        stateRoot: new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(9)),
      }),
    );
    const exact = JSON.parse((fetchMock.mock.calls as [string, { body: string }][])[0][1].body) as {
      params: { stateRoot: string };
    };
    expect(exact.params.stateRoot).toEqual('09'.repeat(32));
  });

  it('rejects a call outside the limits before any request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    expect((await failure(client.getInclusionProofs([]))).detail).toEqual('state_count');
    const many = Array.from({ length: 257 }, (_, i) => stateId(i % 250 === 0 ? 1 : 1)).map((_, i) =>
      StateId.fromCBOR(
        CborSerializer.encodeByteString(new Uint8Array(32).fill(0).map((_v, k) => (k === 0 ? i % 256 : i >> 8))),
      ),
    );
    expect((await failure(client.getInclusionProofs(many))).detail).toEqual('state_count');
    expect((await failure(client.getInclusionProofs([stateId(1), stateId(1)]))).detail).toEqual('duplicate_state_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not an object', { result: 'zz' }],
    ['missing proofs', { result: {} }],
    ['wrong count', { result: { proofs: ['00', '00'] } }],
    ['unknown field', { result: { extra: 1, proofs: [] } }],
    ['proof not hex', { result: { proofs: ['zz'] } }],
    ['proof not a string', { result: { proofs: [1] } }],
    ['view for an exact root', { result: { partitionView: '00', proofs: [] } }],
  ])('classifies %s as an invalid response', async (name, response) => {
    respond(response);
    const exact = name === 'view for an exact root';
    const error = await failure(
      client.getInclusionProofs(
        [stateId(1)],
        exact ? { stateRoot: new DataHash(HashAlgorithm.SHA256, new Uint8Array(32)) } : undefined,
      ),
    );
    expect(error.kind).toEqual('invalid_response');
  });

  it.each([
    [
      -32008,
      { detail: 'view_not_retained', reason: 'proof_unavailable', retryable: true },
      'unavailable',
      'view_not_retained',
      true,
    ],
    [
      -32008,
      { detail: 'unsupported_configuration', reason: 'proof_unavailable', retryable: false },
      'unsupported',
      'unsupported_configuration',
      false,
    ],
    [-32006, { detail: 'pinned_views', reason: 'busy', retryable: true }, 'unavailable', 'busy:pinned_views', true],
    [-32006, undefined, 'unavailable', 'busy', true],
    [-32601, undefined, 'unsupported', 'method_not_found', false],
    [-32602, { detail: 'wrong_shard', reason: 'invalid_request' }, 'rejected', 'wrong_shard', false],
    [-32600, undefined, 'rejected', undefined, false],
    [-32007, { detail: 'response_bytes', reason: 'limit_exceeded' }, 'limit_exceeded', 'response_bytes', false],
    [-32004, undefined, 'server', undefined, false],
    [-32603, { reason: 'internal' }, 'server', undefined, false],
    [-1, undefined, 'server', undefined, false],
  ])('maps JSON-RPC error %i to a typed error', async (code, data, kind, detail, retryable) => {
    respond({ error: { code, data, message: 'x' } });
    const error = await failure(client.getInclusionProofs([stateId(1)]));
    expect(error.kind).toEqual(kind);
    expect(error.detail).toEqual(detail);
    expect(error.retryable).toEqual(retryable);
    expect(error.code).toEqual(code);
  });

  it('types transport failures and keeps cancellation as the platform error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    const transport = await failure(client.getInclusionProofs([stateId(1)]));
    expect(transport.kind).toEqual('transport');
    expect(transport.retryable).toBe(true);

    jest.restoreAllMocks();
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    expect((await failure(client.getInclusionProofs([stateId(1)]))).kind).toEqual('transport');

    jest.restoreAllMocks();
    const controller = new AbortController();
    jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    controller.abort();
    await expect(client.getInclusionProofs([stateId(1)], { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
