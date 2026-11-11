import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { IAggregatorClient } from '../../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import { InclusionProofUnknownError } from '../../../src/api/InclusionProofStatusError.js';
import { IInclusionProofRequestOptions } from '../../../src/api/IRequestOptions.js';
import { JsonRpcDataError } from '../../../src/api/json-rpc/JsonRpcDataError.js';
import { JsonRpcNetworkError } from '../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { JsonRpcResponseError } from '../../../src/api/json-rpc/JsonRpcResponseError.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { IWaitInclusionProofOptions, SleepError, waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { expiresAt } from '../../utils/ExpiresAt.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';
import { createTrustBaseHistorySync } from '../../utils/TrustBaseHistoryFixture.js';
import { createUnicityCertificate } from '../../utils/UnicityCertificateFixture.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

jest.setTimeout(60_000);

type Answer = () => Promise<InclusionProofResponse>;

/** One recorded request: what was asked, and when (monotonic). */
interface ICall {
  readonly at: number;
  readonly options: IInclusionProofRequestOptions | undefined;
}

/** An aggregator whose answers the test scripts; the last script entry repeats. */
type Entry = (call: number, options?: IInclusionProofRequestOptions) => Answer;

class Scripted implements IAggregatorClient {
  public readonly calls: ICall[] = [];

  public constructor(private readonly script: Entry[]) {}

  public getInclusionProof(
    _stateId: StateId,
    options?: IInclusionProofRequestOptions,
  ): Promise<InclusionProofResponse> {
    this.calls.push({ at: performance.now(), options });
    return this.script[Math.min(this.calls.length - 1, this.script.length - 1)](this.calls.length, options)();
  }

  public submitCertificationRequest(): ReturnType<IAggregatorClient['submitCertificationRequest']> {
    throw new Error('not used');
  }
}

describe('waitInclusionProof overload answers', () => {
  const owner = SigningService.generate();
  const { history: trustBase, ready } = createTrustBaseHistorySync(owner.publicKey);
  beforeAll(() => ready);
  const predicateVerifier = PredicateVerifierService.create();
  const verifier = createUnicityCertificateVerifier();
  let transaction: MintTransaction;
  let certificate: UnicityCertificate;

  beforeAll(async () => {
    transaction = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.create(owner.publicKey), {
      expiresAt: expiresAt(),
      salt: TokenSalt.generate(),
      tokenType: TokenType.generate(),
    });
    certificate = await createUnicityCertificate(new DataHash(HashAlgorithm.SHA256, new Uint8Array(32)), owner);
  });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const pending: Answer = () => Promise.resolve(InclusionProofResponse.notCertified(1n, certificate).withWaitedMs(0));
  const failing =
    (error: Error): Answer =>
    () =>
      Promise.reject(error);
  const http = (status: number, retryAfterMs?: number, rpcError?: JsonRpcDataError): JsonRpcNetworkError =>
    new JsonRpcNetworkError(status, 'overloaded', rpcError, retryAfterMs);

  /** Starts a wait and lets the fake clock run; `proof` (the last answer) is a pending read followed by a failure. */
  const start = (client: IAggregatorClient, options: IWaitInclusionProofOptions): Promise<unknown> => {
    const result = waitInclusionProof(
      new StateTransitionClient(client),
      trustBase,
      predicateVerifier,
      verifier,
      transaction,
      options,
    );
    const settled = result.then(
      () => 'proof',
      (e: unknown) => e,
    );
    return settled;
  };
  const times = (client: Scripted): number[] => client.calls.map((c) => Math.round(c.at));
  const ends =
    (n: number, answer: Answer): ((call: number) => Answer) =>
    (call) =>
      call >= n ? failing(new Error('end')) : answer;
  const pendingFirst = (after: Answer): Array<(call: number) => Answer> => [
    step(after),
    step(pending),
    ends(4, pending),
  ];
  const step = (answer: Answer) => (): Answer => answer;

  it('503 then pending then more reads: one pause, then plain reads at the interval, no waitMs', async () => {
    const client = new Scripted(pendingFirst(failing(http(503))));
    const done = start(client, { intervalMs: 1000, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await done).toEqual(new Error('end'));
    expect(client.calls).toHaveLength(4);
    expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
    for (const call of client.calls.slice(1)) {
      expect(call.options).not.toHaveProperty('waitMs');
    }
    const t = times(client);
    expect(t[1] - t[0]).toBe(1000);
    expect(t[2] - t[1]).toBe(1000);
  });

  it('-32006 busy is the same inconclusive answer', async () => {
    const client = new Scripted(pendingFirst(failing(new JsonRpcDataError({ code: -32006, message: 'busy' }))));
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await done).toEqual(new Error('end'));
    expect(client.calls).toHaveLength(4);
    expect(client.calls.slice(1).every((c) => c.options?.waitMs === undefined)).toBe(true);
    expect(times(client)[1] - times(client)[0]).toBe(500);
  });

  it('data.retryable:true on any error code is an overload answer', async () => {
    const error = new JsonRpcDataError({ code: -32099, data: { retryable: true }, message: 'later' });
    const client = new Scripted(pendingFirst(failing(error)));
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await done).toEqual(new Error('end'));
    expect(client.calls).toHaveLength(4);
  });

  it('429 with Retry-After pauses max(interval, Retry-After)', async () => {
    const client = new Scripted(pendingFirst(failing(http(429, 3000))));
    const done = start(client, { intervalMs: 1000, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await done).toEqual(new Error('end'));
    expect(times(client)[1] - times(client)[0]).toBe(3000);
    expect(times(client)[2] - times(client)[1]).toBe(1000);
  });

  it('a Retry-After shorter than the interval does not shorten the pause', async () => {
    const client = new Scripted(pendingFirst(failing(http(503, 200))));
    const done = start(client, { intervalMs: 1000, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(10_000);
    await done;
    expect(times(client)[1] - times(client)[0]).toBe(1000);
  });

  it('a Retry-After larger than the remaining budget fails at once with the timeout type and the overload as cause', async () => {
    const overload = http(503, 30_000);
    const client = new Scripted([step(failing(overload))]);
    const done = start(client, { intervalMs: 1000, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(1);
    const error = await done;
    expect(error).toBeInstanceOf(SleepError);
    expect((error as SleepError).message).toMatch(/overloaded/);
    expect((error as SleepError).message).toMatch(/30000 ms/);
    expect((error as SleepError).cause).toBe(overload);
    expect(client.calls).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a Retry-After above 60 s is capped at 60 s', async () => {
    const client = new Scripted([step(failing(http(503, 600_000)))]);
    const done = start(client, { intervalMs: 1000, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(1);
    expect(((await done) as SleepError).message).toMatch(/60000 ms/);
  });

  it('-32021 and -32020 with data.retryable:true are overloads, not pending/unknown (never an unknown failure)', async () => {
    for (const code of [-32021, -32020]) {
      const error = new JsonRpcDataError({ code, data: { retryable: true }, message: 'later' }, true, 2000);
      const client = new Scripted(pendingFirst(failing(error)));
      const done = start(client, { intervalMs: 500, statusHints: true, timeoutMs: 15_000, unknownGraceMs: 0 });
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await done;
      expect(result).not.toBeInstanceOf(InclusionProofUnknownError);
      expect(result).toEqual(new Error('end'));
      expect(client.calls).toHaveLength(4);
      expect(client.calls.slice(1).every((c) => c.options?.waitMs === undefined)).toBe(true);
      expect(times(client)[1] - times(client)[0]).toBe(2000);
    }
  });

  it('-32021 / -32020 without retryable keep their meaning', async () => {
    const client = new Scripted([
      step(failing(new JsonRpcDataError({ code: -32021, message: 'pending' }))),
      step(failing(new Error('end'))),
    ]);
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(5000);
    expect(await done).toEqual(new Error('end'));
    expect(client.calls).toHaveLength(2);
  });

  it('an HTTP-200 JSON-RPC error carries Retry-After into the pause', async () => {
    const error = new JsonRpcDataError({ code: -32006, message: 'busy' }, true, 4000);
    const client = new Scripted(pendingFirst(failing(error)));
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(10_000);
    await done;
    expect(times(client)[1] - times(client)[0]).toBe(4000);
    expect(times(client)[2] - times(client)[1]).toBe(500);
  });

  it('503 then pending then proof returns the verified proof', async () => {
    const world = await ShardedWorld.create(0);
    const mint = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
      salt: TokenSalt.generate(),
      tokenType: TokenType.generate(),
    });
    await world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(mint));
    const real = world.client('');
    let calls = 0;
    const seen: Array<number | undefined> = [];
    const client: IAggregatorClient = {
      getInclusionProof: (stateId, options) => {
        seen.push(options?.waitMs);
        calls++;
        if (calls === 1) {
          return Promise.reject(http(503));
        }
        if (calls === 2) {
          return pending();
        }
        return real.getInclusionProof(stateId, options);
      },
      submitCertificationRequest: (data) => real.submitCertificationRequest(data),
    };
    const done = waitInclusionProof(
      new StateTransitionClient(client),
      world.trustBase,
      predicateVerifier,
      createUnicityCertificateVerifier(),
      mint,
      { intervalMs: 1000, timeoutMs: 15_000 },
    );
    await jest.advanceTimersByTimeAsync(5000);
    const proof = await done;
    expect(proof.certificationData.transactionHash).toEqual(await mint.calculateTransactionHash());
    expect(calls).toBe(3);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen.slice(1)).toEqual([undefined, undefined]);
  });

  it('a null-id answer (the pre-parse concurrency limit) is an overload only for -32006 or data.retryable', async () => {
    for (const data of [undefined, { retryable: true }]) {
      const error = new JsonRpcDataError({ code: data === undefined ? -32006 : -32099, data, message: 'busy' }, false);
      const client = new Scripted(pendingFirst(failing(error)));
      const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await done).toEqual(new Error('end'));
      expect(client.calls).toHaveLength(4);
      expect(client.calls.slice(1).every((c) => c.options?.waitMs === undefined)).toBe(true);
    }
  });

  it('other unmatched answers stay terminal: null-id pending, not found, other errors', async () => {
    for (const code of [-32021, -32020, -32000]) {
      for (const statusHints of [true, false]) {
        const error = new JsonRpcDataError({ code, message: 'x' }, false);
        const client = new Scripted([step(failing(error))]);
        const done = start(client, { intervalMs: 500, statusHints, timeoutMs: 15_000 });
        await jest.advanceTimersByTimeAsync(1);
        expect(await done).toBe(error);
        expect(client.calls).toHaveLength(1);
      }
    }
  });

  it.each([502, 504])(
    'HTTP %i inside a wait is inconclusive: plain reads, original budget, paced by the interval',
    async (status) => {
      const client = new Scripted(pendingFirst(failing(http(status))));
      const done = start(client, { intervalMs: 700, timeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await done).toEqual(new Error('end'));
      expect(client.calls).toHaveLength(4);
      expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
      expect(client.calls.slice(1).every((c) => c.options?.waitMs === undefined)).toBe(true);
      expect(times(client)[1] - times(client)[0]).toBe(700);
    },
  );

  it('a 502 whose body was oversized (status carried by the response error) is classified by its status', async () => {
    const oversized = new JsonRpcResponseError('JSON-RPC response exceeds the maximum allowed size.', {
      retryAfterMs: 3000,
      status: 502,
    });
    const client = new Scripted(pendingFirst(failing(oversized)));
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await done).toEqual(new Error('end'));
    expect(client.calls).toHaveLength(4);
    expect(times(client)[1] - times(client)[0]).toBe(3000);
    // a malformed *successful* response (no status) stays terminal
    const malformed = new JsonRpcResponseError('JSON-RPC response id mismatch');
    const terminal = new Scripted([step(failing(malformed))]);
    const result = start(terminal, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toBe(malformed);
    expect(terminal.calls).toHaveLength(1);
  });

  it('a 504 pause beyond the budget fails within it with the gateway error as cause', async () => {
    const gateway = http(504, 30_000);
    const client = new Scripted([step(failing(gateway))]);
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(1);
    const error = await done;
    expect(error).toBeInstanceOf(SleepError);
    expect((error as SleepError).cause).toBe(gateway);
    expect(client.calls).toHaveLength(1);
  });

  it('other 5xx statuses stay terminal', async () => {
    for (const status of [500, 501, 505]) {
      const error = http(status);
      const client = new Scripted([step(failing(error))]);
      const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(1);
      expect(await done).toBe(error);
    }
  });

  it('a missing id (not null) is a protocol error and terminal, even for a retryable busy answer', async () => {
    const missingId = new JsonRpcResponseError('JSON-RPC response id mismatch: expected x, got undefined.');
    const client = new Scripted([step(failing(missingId))]);
    const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
    await jest.advanceTimersByTimeAsync(1);
    expect(await done).toBe(missingId);
    expect(client.calls).toHaveLength(1);
  });

  describe('transport failures of a proof read', () => {
    const reset = (): TypeError =>
      new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });

    it.each([
      ['a reset connection', reset()],
      [
        'a stale keep-alive socket',
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
        }),
      ],
      [
        'a refused connection',
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        }),
      ],
      ['a truncated response', new TypeError('terminated')],
    ])('%s is inconclusive: plain reads at the interval, original budget', async (_name, error) => {
      const client = new Scripted(pendingFirst(failing(error)));
      const done = start(client, { intervalMs: 600, timeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await done).toEqual(new Error('end'));
      expect(client.calls).toHaveLength(4);
      expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
      expect(client.calls.slice(1).every((c) => c.options?.waitMs === undefined)).toBe(true);
      expect(times(client)[1] - times(client)[0]).toBe(600);
    });

    it('a reset then the proof: the wait returns the proof, the transport error never reaches the caller', async () => {
      const world = await ShardedWorld.create(0);
      const mint = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
        salt: TokenSalt.generate(),
        tokenType: TokenType.generate(),
      });
      await world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(mint));
      const real = world.client('');
      let calls = 0;
      const client: IAggregatorClient = {
        getInclusionProof: (stateId, options) =>
          ++calls === 1 ? Promise.reject(reset()) : real.getInclusionProof(stateId, options),
        submitCertificationRequest: (data) => real.submitCertificationRequest(data),
      };
      const done = waitInclusionProof(
        new StateTransitionClient(client),
        world.trustBase,
        predicateVerifier,
        createUnicityCertificateVerifier(),
        mint,
        { intervalMs: 500, timeoutMs: 15_000 },
      );
      await jest.advanceTimersByTimeAsync(5000);
      expect((await done).certificationData.transactionHash).toEqual(await mint.calculateTransactionHash());
      expect(calls).toBe(2);
    });

    it('a pause that does not fit fails within the budget with the transport error as cause', async () => {
      const error = reset();
      const client = new Scripted([step(failing(error))]);
      const done = start(client, { intervalMs: 5000, timeoutMs: 3000 });
      await jest.advanceTimersByTimeAsync(1);
      const result = await done;
      expect(result).toBeInstanceOf(SleepError);
      expect((result as SleepError).cause).toBe(error);
      expect(client.calls).toHaveLength(1);
    });

    it.each([
      [
        'an expired certificate',
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }),
        }),
      ],
      [
        'an untrusted issuer',
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('unable to verify the first certificate'), {
            code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          }),
        }),
      ],
      [
        'a hostname mismatch',
        new TypeError('fetch failed', {
          cause: Object.assign(new Error("Hostname/IP does not match certificate's altnames"), {
            code: 'ERR_TLS_CERT_ALTNAME_INVALID',
          }),
        }),
      ],
      ['an invalid URL', new TypeError('Failed to parse URL from nope', { cause: new TypeError('Invalid URL') })],
      ['a refused redirect', new TypeError('fetch failed', { cause: new Error('unexpected redirect') })],
      ['an error that is not a network error', new Error('boom')],
    ])('%s stays terminal', async (_name, error) => {
      const client = new Scripted([step(failing(error))]);
      const done = start(client, { intervalMs: 500, timeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(1);
      expect(await done).toBe(error);
      expect(client.calls).toHaveLength(1);
    });

    it('an abort stays terminal (cancellation wins over the retry)', async () => {
      const controller = new AbortController();
      const client = new Scripted(pendingFirst(failing(reset())));
      const done = start(client, { intervalMs: 5000, signal: controller.signal });
      await jest.advanceTimersByTimeAsync(100);
      controller.abort();
      expect(await done).toBeInstanceOf(SleepError);
      expect(client.calls).toHaveLength(1);
    });
  });

  it('a non-retryable error still ends the wait at once', async () => {
    for (const error of [http(500), http(501), new JsonRpcDataError({ code: -32000, message: 'bad' })]) {
      const client = new Scripted([step(failing(error))]);
      const done = start(client, { intervalMs: 1000, timeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(1);
      expect(await done).toBe(error);
      expect(client.calls).toHaveLength(1);
    }
  });
});
