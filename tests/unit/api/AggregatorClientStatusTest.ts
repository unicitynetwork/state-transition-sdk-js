import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { JsonRpcResponseError } from '../../../src/api/json-rpc/JsonRpcResponseError.js';
import { ProofStatusHint, parseProofStatusHint } from '../../../src/api/ProofStatusHint.js';
import { StateId } from '../../../src/api/StateId.js';
import { ProofUnavailableReason } from '../../../src/consolidation/ConsolidationResult.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, ShardedWorld, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(120_000);

const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32).fill(7)));

/** The v2 result hex of a state the aggregator has not certified: the proof the status hint is about. */
async function emptyProofHex(): Promise<string> {
  const world = await ShardedWorld.create(0);
  return HexConverter.encode((await world.client('').getInclusionProof(stateId)).toCBOR());
}

function respond(result: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const id = (JSON.parse(init?.body as string) as { id: string }).id;
    return Promise.resolve(new Response(JSON.stringify({ id, jsonrpc: '2.0', result })));
  });
}

function sent(spy: jest.SpyInstance): { method: string; params: Record<string, unknown> } {
  return JSON.parse((spy.mock.calls as [string, { body: string }][])[0][1].body) as {
    method: string;
    params: Record<string, unknown>;
  };
}

describe('get_inclusion_proof.v2 status hint', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('sends exactly the legacy request unless asked, and the flag when asked', async () => {
    const proof = await emptyProofHex();
    const spy = respond(proof);
    await client.getInclusionProof(stateId);
    expect(sent(spy).params).toEqual({ stateId: HexConverter.encode(stateId.data) });
    expect(Object.keys(sent(spy).params)).toEqual(['stateId']);

    spy.mockClear();
    await client.getInclusionProof(stateId, { includeStatusHint: false });
    expect(Object.keys(sent(spy).params)).toEqual(['stateId']);

    spy.mockClear();
    await client.getInclusionProof(stateId, { includeStatusHint: true });
    expect(sent(spy).method).toEqual('get_inclusion_proof.v2');
    expect(sent(spy).params).toEqual({ includeStatus: true, stateId: HexConverter.encode(stateId.data) });
  });

  it('a plain string result is the legacy result: no status, unchanged', async () => {
    respond(await emptyProofHex());
    for (const options of [undefined, { includeStatusHint: true }]) {
      const response = await client.getInclusionProof(stateId, options);
      expect(response.statusHint).toBeNull();
      expect(response.inclusionProof).toBeNull();
    }
  });

  it.each(['included', 'pending', 'expired', 'unknown'] as ProofStatusHint[])(
    'accepts the object result with status %s, the proof byte-identical to the legacy one',
    async (status) => {
      const proof = await emptyProofHex();
      respond({ proof, status });
      const response = await client.getInclusionProof(stateId, { includeStatusHint: true });
      expect(response.statusHint).toEqual(status);
      expect(HexConverter.encode(response.toCBOR())).toEqual(proof);
    },
  );

  it.each([['future'], [''], [null], [7], [undefined]])(
    'treats the unrecognized status %p as legacy',
    async (status) => {
      const proof = await emptyProofHex();
      respond({ proof, status });
      const response = await client.getInclusionProof(stateId, { includeStatusHint: true });
      expect(response.statusHint).toBeNull();
      expect(HexConverter.encode(response.toCBOR())).toEqual(proof);
    },
  );

  it.each([[{ status: 'pending' }], [{ proof: 5, status: 'pending' }], [42], [null], [['x']]])(
    'rejects the malformed result %j',
    async (result) => {
      respond(result);
      await expect(client.getInclusionProof(stateId, { includeStatusHint: true })).rejects.toThrow(
        JsonRpcResponseError,
      );
    },
  );

  it('keeps the hint out of the wire form and parses only known values', async () => {
    const proof = await emptyProofHex();
    respond({ proof, status: 'pending' });
    const response = await client.getInclusionProof(stateId, { includeStatusHint: true });
    expect(response.withStatusHint(null).statusHint).toBeNull();
    expect(response.withStatusHint('expired').toCBOR()).toEqual(response.toCBOR());
    expect(['included', 'pending', 'expired', 'unknown', 'x', 3, null].map(parseProofStatusHint)).toEqual([
      'included',
      'pending',
      'expired',
      'unknown',
      null,
      null,
      null,
    ]);
  });
});

describe('get_inclusion_proofs.v1 state details', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  const fail = async (data: unknown): Promise<BatchProofError> => {
    respond(undefined);
    jest.restoreAllMocks();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: -32008, data, message: 'Proof unavailable' }, id, jsonrpc: '2.0' }),
        ),
      );
    });
    const error = await client.getInclusionProofs([stateId]).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BatchProofError);
    return error as BatchProofError;
  };

  it.each([
    ['state_pending', true],
    ['state_expired', false],
    ['state_unknown', false],
    ['state_not_in_root', false],
  ])('maps %s to unavailable, retryable %p whatever the data claims', async (detail, retryable) => {
    const error = await fail({ detail, reason: 'proof_unavailable', retryable: !retryable });
    expect(error.kind).toEqual('unavailable');
    expect(error.detail).toEqual(detail);
    expect(error.retryable).toEqual(retryable);
    expect(error.code).toEqual(-32008);
  });

  it('reads the offending indexes per class, as the server sends them, and ignores junk', async () => {
    const mixed = await fail({
      detail: 'state_unknown',
      indexes: { expired: [2], pending: [0], unknown: [3] },
      reason: 'proof_unavailable',
      retryable: false,
    });
    expect(mixed.indexes).toEqual([3]);
    expect(mixed.indexesByClass).toEqual({ expired: [2], pending: [0], unknown: [3] });
    expect((await fail({ detail: 'state_not_in_root', indexes: { not_in_root: [1, 4] } })).indexes).toEqual([1, 4]);
    expect((await fail({ detail: 'state_pending', indexes: { pending: [0, 3] } })).indexesByClass).toEqual({
      pending: [0, 3],
    });
    // the per-class view is a copy
    const copy = mixed.indexesByClass;
    (copy as Record<string, number[]>).unknown.push(9);
    expect(mixed.indexesByClass?.unknown).toEqual([3]);

    for (const junk of [
      { indexes: [0, 1] },
      { indexes: { pending: [-1] } },
      { indexes: { pending: ['a'] } },
      { indexes: { pending: 3 } },
      { indexes: { pending: new Array<number>(300).fill(1) } },
      { indexes: 'x' },
      {},
    ]) {
      const error = await fail({ detail: 'state_pending', ...junk });
      expect(error.indexes).toBeUndefined();
      expect(error.indexesByClass).toBeUndefined();
      expect(error.retryable).toBe(true);
    }
  });

  it('keeps the earlier details as they were', async () => {
    for (const [detail, kind] of [
      ['state_not_included', 'unavailable'],
      ['view_not_retained', 'unavailable'],
      ['unsupported_configuration', 'unsupported'],
    ] as const) {
      const error = await fail({ detail, retryable: true });
      expect(error.kind).toEqual(kind);
      expect(error.indexes).toBeUndefined();
    }
  });
});

describe('consolidation of the state details', () => {
  const stateFailure = (detail: string, indexes?: number[]): BatchProofError =>
    new BatchProofError('unavailable', 'Proof unavailable', {
      code: -32008,
      detail,
      indexes,
      retryable: detail === 'state_pending',
    });

  it.each([
    ['state_pending', 'state_pending', true],
    ['state_expired', 'state_expired', false],
    ['state_unknown', 'state_unknown', false],
    ['state_not_in_root', 'state_not_in_root', false],
  ] as [string, ProofUnavailableReason, boolean][])(
    'maps a master %s to the unavailable reason %s (retryable %p) with the outer proof positions',
    async (detail, reason, retryable) => {
      const s = await scenario(0);
      const token = await s.history(3);
      const before = token.toCBOR();
      s.world.faults.set('', { failBatch: [stateFailure(detail, [1, 3])] });
      const routing = new ShardRouting({
        endpoints: [{ client: s.world.client(''), shard: shardIdFromBits('') }],
        partitionId: WORLD_PARTITION,
        scheme: [],
      });
      const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(token);
      expect(result).toMatchObject({ detail, proofIndexes: [1, 3], reason, retryable, status: 'unavailable' });
      expect(token.toCBOR()).toEqual(before);
    },
  );

  it('maps the indexes of a peer batch to the token positions of that peer, not of the batch', async () => {
    const s = await scenario(2);
    // a token whose proofs sit in several shards
    let token = await s.history(8);
    for (
      let attempt = 0;
      attempt < 8 &&
      new Set(
        [token.genesis, ...token.transactions].map((t) =>
          t.inclusionProof.unicityCertificate.shardTreeCertificate.shard.toString(),
        ),
      ).size < 2;
      attempt++
    ) {
      token = await s.history(8);
    }
    const proofs = [token.genesis, ...token.transactions];
    const shardOf = (i: number): string =>
      proofs[i].inclusionProof.unicityCertificate.shardTreeCertificate.shard.toString();
    const newest = proofs.length - 1;
    const master = shardOf(newest);
    const peer = [...new Set(proofs.map((_, i) => shardOf(i)))].find((b) => b !== master) as string;
    const positions = proofs.map((_, i) => i).filter((i) => shardOf(i) === peer);

    const routing = new ShardRouting({
      endpoints: s.world.bits.map((b) => {
        const client = s.world.client(b);
        const call = client.getInclusionProofs.bind(client);
        client.getInclusionProofs = (ids, options): ReturnType<typeof call> =>
          b === peer && options?.stateRoot
            ? Promise.reject(stateFailure('state_not_in_root', [0, positions.length - 1]))
            : call(ids, options);
        return { client, shard: shardIdFromBits(b) };
      }),
      partitionId: WORLD_PARTITION,
      scheme: s.world.scheme,
    });
    const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(token);
    expect(result).toMatchObject({
      proofIndexes: [positions[0], positions[positions.length - 1]],
      reason: 'state_not_in_root',
      retryable: false,
      status: 'unavailable',
    });
  });

  it('never lets a hint alter verification: a token is judged by its proofs, not by what a shard says', async () => {
    const s = await scenario(0);
    const token = await s.history(2);
    // the shard calls every state unknown, the token still verifies and consolidation reports an unavailable outcome
    s.world.faults.set('', { failBatch: [stateFailure('state_unknown')] });
    const routing = new ShardRouting({
      endpoints: [{ client: s.world.client(''), shard: shardIdFromBits('') }],
      partitionId: WORLD_PARTITION,
      scheme: [],
    });
    const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(token);
    expect(result.status).toEqual('unavailable');
    expect((await token.verify(s.context)).status).toEqual('OK');
  });
});

describe('resubmitting a request the aggregator already holds', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  const rpcError = (code: number, message: string, data: unknown): jest.SpyInstance =>
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(new Response(JSON.stringify({ error: { code, data, message }, id, jsonrpc: '2.0' })));
    });

  async function certificationData(): Promise<CertificationData> {
    const s = await scenario(0);
    const token = await s.history(0);
    return token.genesis.inclusionProof.certificationData;
  }

  it('a duplicate key error of the queue is a queued state id, which may not be this request: not accepted', async () => {
    const data = await certificationData();
    rpcError(
      -32603,
      'Failed to submit certification request',
      'failed to store certificationRequest: failed to store commitment: write exception: write errors: [E11000 duplicate key error collection: aggregator.certification_requests index: stateId_1 dup key: { stateId: "ab" }]',
    );
    const response = await client.submitCertificationRequest(data);
    expect(response.status).toEqual(CertificationStatus.STATE_ID_QUEUED);
    expect(response.isStateIdQueued).toBe(true);
    expect(response.isAccepted).toBe(false);
    expect(response.isAlreadySubmitted).toBe(false);
  });

  it('only a server that compared the queued request can say already submitted', async () => {
    const data = await certificationData();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(
        new Response(JSON.stringify({ id, jsonrpc: '2.0', result: { status: 'ALREADY_SUBMITTED' } })),
      );
    });
    const response = await client.submitCertificationRequest(data);
    expect(response.isAlreadySubmitted).toBe(true);
    expect(response.isAccepted).toBe(true);
    expect(response.isStateIdQueued).toBe(false);
  });

  it('only that error is: other internal errors, other codes and other messages still fail', async () => {
    const data = await certificationData();
    for (const [code, message, details] of [
      [-32603, 'Failed to submit certification request', 'failed to store certificationRequest: connection refused'],
      [-32603, 'Failed to submit certification request', undefined],
      [-32004, 'Database error', 'E11000 duplicate key error'],
      [-32602, 'Invalid params', 'duplicate key'],
    ] as const) {
      jest.restoreAllMocks();
      rpcError(code, message, details);
      await expect(client.submitCertificationRequest(data)).rejects.toMatchObject({ code });
    }
  });

  it('an accepted submission keeps its status, and a response is accepted only for those two statuses', async () => {
    const data = await certificationData();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(new Response(JSON.stringify({ id, jsonrpc: '2.0', result: { status: 'SUCCESS' } })));
    });
    const ok = await client.submitCertificationRequest(data);
    expect(ok.status).toEqual('SUCCESS');
    expect(ok.isAccepted).toBe(true);
    expect(ok.isAlreadySubmitted).toBe(false);
    for (const status of ['STATE_ID_EXISTS', 'REQUEST_EXPIRED', 'whatever']) {
      expect(CertificationResponse.create(status).isAccepted).toBe(false);
    }
  });
});
