import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import { JsonRpcResponseError } from '../../../src/api/json-rpc/JsonRpcResponseError.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { isMalformedParams, isWireMilliseconds } from '../../../src/internal/longPoll.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';

jest.setTimeout(120_000);

const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32).fill(7)));
const ID_HEX = HexConverter.encode(stateId.data);

type Reply = { error: unknown } | { result: unknown };

interface ISent {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly raw: string;
  readonly signal: AbortSignal | undefined;
}

/** Answer each request with the next reply (the last one repeats); record what was sent. */
function serve(...replies: Reply[]): { readonly sent: ISent[]; readonly spy: jest.SpyInstance } {
  const sent: ISent[] = [];
  const spy = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const raw = init?.body as string;
    const body = JSON.parse(raw) as { id: string; method: string; params: Record<string, unknown> };
    sent.push({ method: body.method, params: body.params, raw, signal: init?.signal ?? undefined });
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    return Promise.resolve(new Response(JSON.stringify({ id: body.id, jsonrpc: '2.0', ...reply })));
  });
  return { sent, spy };
}

/** The v2 hex of a state nobody certified. */
async function emptyProofHex(): Promise<string> {
  const world = await ShardedWorld.create(0);
  return HexConverter.encode((await world.client('').getInclusionProof(stateId)).toCBOR());
}

const MALFORMED = {
  error: {
    code: -32602,
    data: { detail: 'malformed_params', reason: 'invalid_request', retryable: false },
    message: 'Invalid params',
  },
};

describe('waitMs / waitedMs lexical rules', () => {
  it.each([0, 1, 20_000, Number.MAX_SAFE_INTEGER])('admits %p', (value) => {
    expect(isWireMilliseconds(value)).toBe(true);
  });

  it.each([-1, -0, 0.5, 1e21, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '5', null, undefined, true, [], {}, 5n])(
    'rejects %p',
    (value) => {
      expect(isWireMilliseconds(value)).toBe(false);
    },
  );

  it('recognizes only the generic malformed params class', () => {
    expect(isMalformedParams(-32602, { detail: 'malformed_params', reason: 'invalid_request' })).toBe(true);
    for (const [code, data] of [
      [-32602, { detail: 'wrong_shard', reason: 'invalid_request' }],
      [-32602, { detail: 'malformed_params', reason: 'other' }],
      [-32602, { detail: 'malformed_params', reason: 'invalid_request', waitedMs: 0 }],
      [-32602, undefined],
      [-32602, 'malformed_params'],
      [-32600, { detail: 'malformed_params', reason: 'invalid_request' }],
      [-32000, { detail: 'malformed_params', reason: 'invalid_request' }],
    ] as [number, unknown][]) {
      expect(isMalformedParams(code, data)).toBe(false);
    }
  });
});

describe('get_inclusion_proof.v2 waitMs', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('sends nothing new unless asked: the request bytes are the legacy ones', async () => {
    const { sent } = serve({ result: await emptyProofHex() });
    await client.getInclusionProof(stateId);
    await client.getInclusionProof(stateId, { includeStatusHint: true, waitMs: undefined });
    expect(Object.keys(sent[0].params)).toEqual(['stateId']);
    expect(Object.keys(sent[1].params)).toEqual(['stateId', 'includeStatus']);
  });

  it.each([0, 1, 20_000, Number.MAX_SAFE_INTEGER])('sends waitMs %p as a JSON integer', async (waitMs) => {
    const { sent } = serve({ result: await emptyProofHex() });
    await client.getInclusionProof(stateId, { waitMs });
    expect(sent[0].params).toEqual({ stateId: ID_HEX, waitMs });
    expect(sent[0].raw).toContain(`"waitMs":${waitMs}}`);
  });

  it.each([-1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5', null])(
    'throws a RangeError for %p before sending anything',
    async (waitMs) => {
      const { spy } = serve({ result: await emptyProofHex() });
      await expect(client.getInclusionProof(stateId, { waitMs: waitMs as number })).rejects.toThrow(RangeError);
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('decodes {proof, waitedMs}: the echo is metadata, the proof bytes are untouched', async () => {
    const proof = await emptyProofHex();
    serve({ result: { proof, waitedMs: 7_500 } });
    const response = await client.getInclusionProof(stateId, { waitMs: 10_000 });
    expect(response.waitedMs).toBe(7_500);
    expect(response.statusHint).toBeNull();
    expect(HexConverter.encode(response.toCBOR())).toEqual(proof);
  });

  it('decodes {proof, status, waitedMs} and a zero echo', async () => {
    const proof = await emptyProofHex();
    serve({ result: { proof, status: 'pending', waitedMs: 0 } });
    const response = await client.getInclusionProof(stateId, { includeStatusHint: true, waitMs: 10_000 });
    expect(response.waitedMs).toBe(0);
    expect(response.statusHint).toBe('pending');
    expect(HexConverter.encode(response.toCBOR())).toEqual(proof);
    // later transformations keep both pieces of metadata
    expect(response.withStatusHint('unknown').waitedMs).toBe(0);
    expect(response.withWaitedMs(3).statusHint).toBe('pending');
    expect(response.withWaitedMs(null).waitedMs).toBeNull();
  });

  it('a server that ignores the wait answers the bare string: no echo, no error', async () => {
    serve({ result: await emptyProofHex() });
    const response = await client.getInclusionProof(stateId, { waitMs: 10_000 });
    expect(response.waitedMs).toBeNull();
    expect(response.inclusionProof).toBeNull();
  });

  it('an object without an echo is a server that does not know it: null', async () => {
    serve({ result: { proof: await emptyProofHex(), status: 'pending' } });
    const response = await client.getInclusionProof(stateId, { includeStatusHint: true, waitMs: 10_000 });
    expect(response.waitedMs).toBeNull();
  });

  it.each([[-1], [-0], [1.5], [null], ['5'], [true], [[]], [Number.MAX_SAFE_INTEGER + 1]])(
    'rejects the malformed echo %p as a protocol error',
    async (waitedMs) => {
      const proof = await emptyProofHex();
      // JSON cannot carry -0 distinctly from 0 after serialization, so the raw body is built by hand
      jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
        const id = (JSON.parse(init?.body as string) as { id: string }).id;
        const echo = Object.is(waitedMs, -0) ? '-0' : JSON.stringify(waitedMs);
        return Promise.resolve(
          new Response(`{"id":${JSON.stringify(id)},"jsonrpc":"2.0","result":{"proof":"${proof}","waitedMs":${echo}}}`),
        );
      });
      await expect(client.getInclusionProof(stateId, { waitMs: 10_000 })).rejects.toThrow(JsonRpcResponseError);
    },
  );

  it('rejects an echo that answers no wait request', async () => {
    serve({ result: { proof: await emptyProofHex(), status: 'pending', waitedMs: 5 } });
    await expect(client.getInclusionProof(stateId, { includeStatusHint: true })).rejects.toThrow(JsonRpcResponseError);
  });

  it('exposes the echo only as metadata of the response type', async () => {
    const response = await ShardedWorld.create(0).then((w) => w.client('').getInclusionProof(stateId));
    expect(response.waitedMs).toBeNull();
    expect(response).toBeInstanceOf(InclusionProofResponse);
  });
});

describe('get_inclusion_proofs.v1 waitMs', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  const ids = [stateId];
  const failure = async (promise: Promise<unknown>): Promise<BatchProofError> => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BatchProofError);
    return error as BatchProofError;
  };
  const pending = (extra: object = {}): Reply => ({
    error: {
      code: -32008,
      data: {
        detail: 'state_pending',
        indexes: { pending: [0] },
        reason: 'proof_unavailable',
        retryable: true,
        ...extra,
      },
      message: 'Proof unavailable',
    },
  });

  it('sends the legacy request unless asked', async () => {
    const { sent } = serve(pending());
    await failure(client.getInclusionProofs(ids));
    expect(sent[0].params).toEqual({ stateIds: [ID_HEX], stateRoot: 'latest' });
    expect(sent[0].raw).not.toContain('waitMs');
  });

  it('sends waitMs, zero included, next to the unchanged params', async () => {
    for (const waitMs of [0, 15_000]) {
      const { sent } = serve(pending({ waitedMs: waitMs }));
      await failure(client.getInclusionProofs(ids, { waitMs }));
      expect(sent[0].params).toEqual({ stateIds: [ID_HEX], stateRoot: 'latest', waitMs });
      jest.restoreAllMocks();
    }
  });

  it('puts error.data.waitedMs on the typed error, keeping code, detail and indexes', async () => {
    serve(pending({ waitedMs: 8_000 }));
    const error = await failure(client.getInclusionProofs(ids, { waitMs: 8_000 }));
    expect(error).toMatchObject({
      code: -32008,
      detail: 'state_pending',
      kind: 'unavailable',
      requests: 1,
      retryable: true,
      waitedMs: 8_000,
    });
    expect(error.indexes).toEqual([0]);
  });

  it('an error without an echo has none; an echo nobody asked for is ignored', async () => {
    serve(pending());
    expect((await failure(client.getInclusionProofs(ids, { waitMs: 5 }))).waitedMs).toBeNull();
    serve(pending({ waitedMs: 99 }));
    expect((await failure(client.getInclusionProofs(ids))).waitedMs).toBeNull();
  });

  it.each([[-1], [1.5], [null], ['3'], [Number.MAX_SAFE_INTEGER + 1]])(
    'turns the malformed error echo %p into an invalid_response',
    async (waitedMs) => {
      serve(pending({ waitedMs }));
      const error = await failure(client.getInclusionProofs(ids, { waitMs: 5 }));
      expect(error.kind).toBe('invalid_response');
    },
  );

  it('rejects waitMs with an exact root, zero included, before sending', async () => {
    const { spy } = serve(pending());
    const stateRoot = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32));
    for (const waitMs of [0, 1000]) {
      const error = await failure(client.getInclusionProofs(ids, { stateRoot, waitMs }));
      expect(error).toMatchObject({ detail: 'wait_with_state_root', kind: 'rejected', requests: 0 });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects waitMs %p before sending', async (waitMs) => {
    const { spy } = serve(pending());
    expect(await failure(client.getInclusionProofs(ids, { waitMs }))).toMatchObject({
      detail: 'invalid_wait_ms',
      kind: 'rejected',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('admits the echo in a success result only for a wait request, and only as a wire integer', async () => {
    serve({ result: { proofs: [], waitedMs: 3 } });
    // wrong count: the field itself must not be the reason
    const wrongCount = await failure(client.getInclusionProofs(ids, { waitMs: 5 }));
    expect(wrongCount.message).toContain('Expected 1 proofs');

    const unrequested = await failure(client.getInclusionProofs(ids));
    expect(unrequested.message).toContain('Unexpected batch result field "waitedMs"');

    for (const waitedMs of [-1, 1.5, null, '3']) {
      serve({ result: { proofs: [], waitedMs } });
      expect((await failure(client.getInclusionProofs(ids, { waitMs: 5 }))).message).toContain('Malformed waitedMs');
    }
  });

  describe('capability negotiation', () => {
    it('repeats exactly once without waitMs on the generic malformed params, keeping the other params and the signal', async () => {
      const { sent } = serve(MALFORMED, pending());
      const controller = new AbortController();
      const error = await failure(client.getInclusionProofs(ids, { signal: controller.signal, waitMs: 5_000 }));
      expect(sent).toHaveLength(2);
      expect(sent[0].params).toEqual({ stateIds: [ID_HEX], stateRoot: 'latest', waitMs: 5_000 });
      expect(sent[1].params).toEqual({ stateIds: [ID_HEX], stateRoot: 'latest' });
      expect(sent[1].signal).toBe(controller.signal);
      // the second answer is the one reported, counted as the second request
      expect(error).toMatchObject({ detail: 'state_pending', requests: 2, waitedMs: null });
    });

    it('propagates the second error unchanged and never retries a third time', async () => {
      const { sent } = serve(MALFORMED);
      const error = await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(sent).toHaveLength(2);
      expect(error).toMatchObject({ code: -32602, detail: 'malformed_params', kind: 'rejected', requests: 2 });
    });

    it('does not retry a malformed_params that carries waitedMs: the server understood the wait', async () => {
      const understood = {
        error: { ...MALFORMED.error, data: { ...MALFORMED.error.data, waitedMs: 0 } },
      };
      const { sent } = serve(understood);
      const error = await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(sent).toHaveLength(1);
      expect(error).toMatchObject({ detail: 'malformed_params', requests: 1, waitedMs: 0 });
    });

    it('is not remembered: the next call tries the wait again', async () => {
      const { sent } = serve(MALFORMED, pending(), pending({ waitedMs: 1 }));
      await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(sent.map((s) => 'waitMs' in s.params)).toEqual([true, false, true]);
    });

    it('a success after the retry carries requests 2 and no echo', async () => {
      serve(MALFORMED, { result: { proofs: [] } });
      // zero proofs for one id is a count failure, but it is reported with the request count of the retry
      const error = await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(error).toMatchObject({ kind: 'invalid_response', requests: 2 });
    });

    it('a waitedMs in the answer to the repeat is unexpected (no wait was sent)', async () => {
      serve(MALFORMED, { result: { proofs: [], waitedMs: 3 } });
      const error = await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(error.message).toContain('Unexpected batch result field "waitedMs"');
    });

    it.each([
      [
        'a different validation reason',
        { error: { code: -32602, data: { detail: 'wrong_shard', reason: 'invalid_request' }, message: 'x' } },
      ],
      [
        'an unmatched code',
        { error: { code: -32600, data: { detail: 'malformed_params', reason: 'invalid_request' }, message: 'x' } },
      ],
      ['a limit', { error: { code: -32007, data: { detail: 'state_count' }, message: 'x' } }],
      ['busy', { error: { code: -32006, message: 'x' } }],
      ['an internal error', { error: { code: -32603, message: 'x' } }],
      ['unsupported method', { error: { code: -32601, message: 'x' } }],
      ['pending', pending()],
    ] as [string, Reply][])('does not retry on %s', async (_name, reply) => {
      const { sent } = serve(reply);
      const error = await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(sent).toHaveLength(1);
      expect(error.requests).toBe(1);
    });

    it('keeps -32601 as the unsupported batch outcome', async () => {
      serve({ error: { code: -32601, message: 'Method not found' } });
      expect(await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }))).toMatchObject({
        detail: 'method_not_found',
        kind: 'unsupported',
      });
    });

    it('does not retry a response for another request id, an HTTP error page or a transport failure', async () => {
      const wrongId = jest
        .spyOn(global, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ id: 'someone-else', jsonrpc: '2.0', ...MALFORMED }))),
        );
      await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(wrongId).toHaveBeenCalledTimes(1);
      jest.restoreAllMocks();

      const html = jest
        .spyOn(global, 'fetch')
        .mockImplementation(() => Promise.resolve(new Response('<html>bad request</html>', { status: 400 })));
      expect(await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }))).toMatchObject({ kind: 'transport' });
      expect(html).toHaveBeenCalledTimes(1);
      jest.restoreAllMocks();

      const down = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
      expect(await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }))).toMatchObject({ kind: 'transport' });
      expect(down).toHaveBeenCalledTimes(1);
    });

    it('a null-id error (the server could not read the id) is not capability evidence', async () => {
      const spy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ id: null, jsonrpc: '2.0', ...MALFORMED }))),
        );
      await failure(client.getInclusionProofs(ids, { waitMs: 5_000 }));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('never retries a call that sent no wait', async () => {
      const { sent } = serve(MALFORMED);
      await failure(client.getInclusionProofs(ids));
      expect(sent).toHaveLength(1);
    });

    it('does not renew the deadline: an aborted signal ends the repeat as a cancellation', async () => {
      const controller = new AbortController();
      let calls = 0;
      jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
        calls++;
        const id = (JSON.parse(init?.body as string) as { id: string }).id;
        if (calls === 1) {
          controller.abort(new DOMException('deadline', 'TimeoutError'));
          return Promise.resolve(new Response(JSON.stringify({ id, jsonrpc: '2.0', ...MALFORMED })));
        }
        return Promise.reject(init?.signal?.reason as Error);
      });
      const error = await client.getInclusionProofs(ids, { signal: controller.signal, waitMs: 5_000 }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toMatchObject({ name: 'TimeoutError' });
      expect(error).not.toBeInstanceOf(BatchProofError);
    });
  });
});
