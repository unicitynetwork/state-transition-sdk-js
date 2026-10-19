import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { IAggregatorClient } from '../../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import { InclusionProofConflictError } from '../../../src/api/InclusionProofStatusError.js';
import { IInclusionProofRequestOptions } from '../../../src/api/IRequestOptions.js';
import { JsonRpcDataError } from '../../../src/api/json-rpc/JsonRpcDataError.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { ProofStatusHint } from '../../../src/api/ProofStatusHint.js';
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
import { createRootTrustBase } from '../../utils/RootTrustBaseFixture.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';
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
const entry = (fn: Entry): Entry => fn;

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

describe('waitInclusionProof long poll', () => {
  const owner = SigningService.generate();
  const trustBase = createRootTrustBase(owner.publicKey);
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
  afterEach(() => jest.restoreAllMocks());

  const run = (client: IAggregatorClient, options: IWaitInclusionProofOptions): ReturnType<typeof waitInclusionProof> =>
    waitInclusionProof(new StateTransitionClient(client), trustBase, predicateVerifier, verifier, transaction, options);

  /** A not-certified answer carrying the given echo and hint. */
  const pending =
    (waitedMs: number | null, hint: ProofStatusHint | null = null): Answer =>
    () =>
      Promise.resolve(InclusionProofResponse.notCertified(1n, certificate).withWaitedMs(waitedMs).withStatusHint(hint));
  const boom = (): Answer => () => Promise.reject(new Error('boom'));
  const step = (answer: Answer) => (): Answer => answer;
  /** Ends a wait that would otherwise go on: the third call fails. */
  const endsAt =
    (n: number, answer: Answer): ((call: number) => Answer) =>
    (call) =>
      call >= n ? boom() : answer;

  describe('request options', () => {
    it('long polls by default: a wait that fits the 15s default budget less the 2s margin', async () => {
      const client = new Scripted([endsAt(2, pending(13_000))]);
      await expect(run(client, { intervalMs: 1 })).rejects.toThrow('boom');
      const first = client.calls[0].options;
      expect(first?.includeStatusHint).toBe(true);
      expect(first?.waitMs).toBeLessThanOrEqual(13_000);
      expect(first?.waitMs).toBeGreaterThan(12_000);
      expect(Number.isInteger(first?.waitMs)).toBe(true);
      // the next wait is sized from what is left, never renewed
      expect(client.calls[1].options?.waitMs).toBeLessThanOrEqual(first?.waitMs as number);
    });

    it('sizes the wait from an explicit budget: min(window, left - margin)', async () => {
      const client = new Scripted([endsAt(2, pending(1))]);
      await expect(run(client, { intervalMs: 1, timeoutMs: 5000 })).rejects.toThrow('boom');
      expect(client.calls[0].options?.waitMs).toBeLessThanOrEqual(3000);
      expect(client.calls[0].options?.waitMs).toBeGreaterThan(2500);

      const windowed = new Scripted([endsAt(2, pending(1))]);
      await expect(
        run(windowed, { intervalMs: 1, longPoll: { marginMs: 100, windowMs: 400 }, timeoutMs: 60_000 }),
      ).rejects.toThrow('boom');
      expect(windowed.calls[0].options?.waitMs).toBe(400);
    });

    it('asks for the preferred window of a signal-only caller, not for the 15s default', async () => {
      const controller = new AbortController();
      const client = new Scripted([endsAt(2, pending(20_000))]);
      await expect(run(client, { intervalMs: 1, signal: controller.signal })).rejects.toThrow('boom');
      expect(client.calls[0].options?.waitMs).toBe(20_000);
      expect(client.calls[1].options?.waitMs).toBe(20_000);
    });

    it('sends no wait when none fits and finishes on the existing deadline', async () => {
      const client = new Scripted([endsAt(3, pending(0))]);
      await expect(run(client, { intervalMs: 1, longPoll: { marginMs: 1000 }, timeoutMs: 800 })).rejects.toThrow(
        'boom',
      );
      for (const call of client.calls) {
        expect(call.options).not.toHaveProperty('waitMs');
      }
      expect(client.calls[0].options?.includeStatusHint).toBe(true);
    });

    it('longPoll:false polls exactly as before: no waitMs, same options', async () => {
      const client = new Scripted([endsAt(3, pending(5))]);
      await expect(run(client, { intervalMs: 1, longPoll: false })).rejects.toThrow('boom');
      expect(client.calls).toHaveLength(3);
      for (const call of client.calls) {
        expect(Object.keys(call.options ?? {}).sort()).toEqual(['includeStatusHint', 'signal']);
      }
    });

    it('statusHints:false stays proof-only but may still long poll', async () => {
      const client = new Scripted([endsAt(3, pending(1, 'expired'))]);
      await expect(run(client, { intervalMs: 1, statusHints: false, timeoutMs: 5000 })).rejects.toThrow('boom');
      expect(client.calls).toHaveLength(3); // an `expired` hint is not interpreted
      expect(client.calls[0].options).not.toHaveProperty('includeStatusHint');
      expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
    });

    it('the deprecated positional form never long polls and sends no hint flag', async () => {
      const client = new Scripted([endsAt(3, pending(5))]);
      const result = waitInclusionProof(
        new StateTransitionClient(client),
        trustBase,
        predicateVerifier,
        verifier,
        transaction,
        new AbortController().signal,
        1,
      );
      await expect(result).rejects.toThrow('boom');
      for (const call of client.calls) {
        expect(Object.keys(call.options ?? {})).toEqual(['signal']);
      }
    });

    it.each([0, -1, NaN, Infinity, 2 ** 31])('rejects the budget %p before any request', async (timeoutMs) => {
      const client = new Scripted([step(boom())]);
      await expect(run(client, { timeoutMs })).rejects.toThrow(RangeError);
      expect(client.calls).toHaveLength(0);
    });

    it.each([{ marginMs: -1 }, { windowMs: NaN }, { windowMs: -5 }, { windowMs: Number.MAX_SAFE_INTEGER + 1 }])(
      'rejects the tuning %j',
      async (longPoll) => {
        const client = new Scripted([step(boom())]);
        await expect(run(client, { longPoll })).rejects.toThrow(RangeError);
        expect(client.calls).toHaveLength(0);
      },
    );
  });

  describe('pacing', () => {
    const interval = 60;
    const gaps = (client: Scripted): number[] => client.calls.slice(1).map((call, i) => call.at - client.calls[i].at);

    it('a missing echo drops the wait for the rest of the call and polls at the normal interval', async () => {
      const client = new Scripted([endsAt(3, pending(null))]);
      await expect(run(client, { intervalMs: interval, timeoutMs: 5000 })).rejects.toThrow('boom');
      expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
      expect(client.calls[1].options).not.toHaveProperty('waitMs');
      expect(gaps(client)[0]).toBeGreaterThanOrEqual(interval - 5);
    });

    it('does not remember the missing echo for the next call', async () => {
      for (let round = 0; round < 2; round++) {
        const client = new Scripted([endsAt(2, pending(null))]);
        await expect(run(client, { intervalMs: 1, timeoutMs: 5000 })).rejects.toThrow('boom');
        expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
      }
    });

    it('a zero echo keeps the wait but never tight-loops: the rest of the interval is slept', async () => {
      const client = new Scripted([endsAt(4, pending(0))]);
      await expect(run(client, { intervalMs: interval, timeoutMs: 5000 })).rejects.toThrow('boom');
      expect(client.calls[1].options?.waitMs).toBeGreaterThan(0);
      for (const gap of gaps(client)) {
        expect(gap).toBeGreaterThanOrEqual(interval - 5);
      }
    });

    it('a configured zero interval still pauses between instant zero echoes', async () => {
      const client = new Scripted([endsAt(4, pending(0))]);
      await expect(run(client, { intervalMs: 0, timeoutMs: 5000 })).rejects.toThrow('boom');
      for (const gap of gaps(client)) {
        expect(gap).toBeGreaterThanOrEqual(8);
      }
    });

    it('a missing echo with a configured zero interval is still floored (no spin on a server that ignores the wait)', async () => {
      const client = new Scripted([endsAt(5, pending(null))]);
      await expect(run(client, { intervalMs: 0, timeoutMs: 5000 })).rejects.toThrow('boom');
      for (const gap of gaps(client)) {
        expect(gap).toBeGreaterThanOrEqual(8);
      }
    });

    it('a positive echo with a zero interval never re-calls back to back', async () => {
      const client = new Scripted([endsAt(5, pending(1))]);
      await expect(run(client, { intervalMs: 0, timeoutMs: 5000 })).rejects.toThrow('boom');
      for (const gap of gaps(client)) {
        expect(gap).toBeGreaterThanOrEqual(8);
      }
    });

    it('a positive echo of an instant answer is paced like any other (the echo is not elapsed time)', async () => {
      const client = new Scripted([endsAt(3, pending(20_000))]);
      await expect(run(client, { intervalMs: interval, timeoutMs: 5000 })).rejects.toThrow('boom');
      for (const gap of gaps(client)) {
        expect(gap).toBeGreaterThanOrEqual(interval - 5);
      }
    });

    it('re-calls at once only after a pending answer that locally took at least the interval', async () => {
      const delays: number[] = [];
      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((handler: () => void, ms?: number) => {
        delays.push(ms as number);
        return realSetTimeout(handler, ms);
      });
      const slow: Answer = () => new Promise((resolve) => realSetTimeout(() => resolve(pending(100)()), 90));
      const client = new Scripted([entry((call) => (call >= 3 ? boom() : slow))]);
      await expect(run(client, { intervalMs: 77, timeoutMs: 5000 })).rejects.toThrow('boom');
      expect(client.calls).toHaveLength(3);
      // no sleep of the interval, nor of the floor, was needed between the slow calls
      expect(delays).not.toContain(77);
      expect(delays.filter((ms) => ms === 10)).toHaveLength(0);
    });

    it('an unknown hint within the grace follows the normal interval, even after a slow positive echo', async () => {
      const delays: number[] = [];
      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((handler: () => void, ms?: number) => {
        delays.push(ms as number);
        return realSetTimeout(handler, ms);
      });
      const slow: Answer = () => new Promise((resolve) => realSetTimeout(() => resolve(pending(100, 'unknown')()), 90));
      const client = new Scripted([entry((call) => (call >= 2 ? boom() : slow))]);
      await expect(run(client, { intervalMs: 77, timeoutMs: 5000, unknownGraceMs: 60_000 })).rejects.toThrow('boom');
      expect(delays).toContain(77);
    });

    it('keeps the elapsed-time unknown grace: the first unknown after the grace fails', async () => {
      const client = new Scripted([step(pending(50, 'unknown'))]);
      await expect(run(client, { intervalMs: 1, timeoutMs: 5000, unknownGraceMs: 0 })).rejects.toMatchObject({
        name: 'InclusionProofUnknownError',
      });
      expect(client.calls).toHaveLength(1);
    });

    it('the legacy pending error carries no echo: the wait is dropped', async () => {
      const client = new Scripted([
        entry((call) =>
          call >= 3
            ? boom()
            : (): Promise<InclusionProofResponse> =>
                Promise.reject(new JsonRpcDataError({ code: -32021, message: 'pending' })),
        ),
      ]);
      await expect(run(client, { intervalMs: 1, timeoutMs: 5000 })).rejects.toThrow('boom');
      expect(client.calls[0].options?.waitMs).toBeGreaterThan(0);
      expect(client.calls[1].options).not.toHaveProperty('waitMs');
    });
  });

  describe('deadlines and transport timeout', () => {
    it('a request that outlives wait + margin is inconclusive, not a failure; the budget is not renewed', async () => {
      const hang = (options?: IInclusionProofRequestOptions): Promise<InclusionProofResponse> =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason as Error), { once: true });
        });
      const client = new Scripted([
        entry((call, options) =>
          call === 1 ? (): Promise<InclusionProofResponse> => hang(options) : endsAt(2, pending(null))(call),
        ),
      ]);
      const begun = performance.now();
      await expect(
        run(client, { intervalMs: 1, longPoll: { marginMs: 40, windowMs: 40 }, timeoutMs: 5000 }),
      ).rejects.toThrow('boom');
      // the first request was cut at about wait + margin (80ms), well within the budget, and the wait went on without it
      expect(performance.now() - begun).toBeLessThan(2000);
      expect(client.calls).toHaveLength(2);
      expect(client.calls[1].options).not.toHaveProperty('waitMs');
    });

    it('ends with the budget as a SleepError whose cause is a TimeoutError', async () => {
      const client = new Scripted([step(pending(null))]);
      const error = await run(client, { intervalMs: 20, longPoll: false, timeoutMs: 120 }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(SleepError);
      expect((error as SleepError).cause).toMatchObject({ name: 'TimeoutError' });
    });

    it('the budget and a caller signal both apply, whichever ends first', async () => {
      const controller = new AbortController();
      const client = new Scripted([
        entry((call) =>
          call >= 2
            ? (): Promise<InclusionProofResponse> => {
                controller.abort(new Error('caller'));
                return pending(null)();
              }
            : pending(null),
        ),
      ]);
      const error = await run(client, { intervalMs: 5, signal: controller.signal, timeoutMs: 60_000 }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(SleepError);
      expect((error as SleepError).cause).toMatchObject({ message: 'caller' });
    });

    it('an already aborted signal sends nothing, with or without a budget', async () => {
      const controller = new AbortController();
      controller.abort(new Error('gone'));
      for (const timeoutMs of [undefined, 1000]) {
        const client = new Scripted([step(pending(null))]);
        await expect(run(client, { signal: controller.signal, timeoutMs })).rejects.toThrow(SleepError);
        expect(client.calls).toHaveLength(0);
      }
    });

    it('settles when the signal fires during a hung long poll that ignores its signal', async () => {
      const controller = new AbortController();
      const client = new Scripted([() => (): Promise<InclusionProofResponse> => new Promise(() => undefined)]);
      const result = run(client, { signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort(new Error('deadline'));
      await expect(result).rejects.toThrow(SleepError);
    });

    it('survives a signal that refuses listener removal while a budget is joined to it', async () => {
      const controller = new AbortController();
      const hostile = new Proxy(controller.signal, {
        get(target: AbortSignal, property: string | symbol): unknown {
          if (property === 'removeEventListener') {
            return (): never => {
              throw new Error('removal refused');
            };
          }
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
      const client = new Scripted([endsAt(2, pending(null))]);
      await expect(run(client, { intervalMs: 1, signal: hostile, timeoutMs: 5000 })).rejects.toThrow('boom');
    });

    it('leaves no timer behind after the wait ends', async () => {
      const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
      const client = new Scripted([endsAt(2, pending(null))]);
      await expect(run(client, { intervalMs: 1, timeoutMs: 60_000 })).rejects.toThrow('boom');
      expect(process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length).toBeLessThanOrEqual(before);
    });
  });

  describe('verification is never decided by the echo', () => {
    it('returns the verified proof of a long polled answer', async () => {
      const world = await ShardedWorld.create(0);
      const mint = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
        salt: TokenSalt.generate(),
        tokenType: TokenType.generate(),
      });
      await world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(mint));
      const real = world.client('');
      const client: IAggregatorClient = {
        getInclusionProof: async (stateId, options) =>
          (await real.getInclusionProof(stateId, options)).withWaitedMs(options?.waitMs === undefined ? null : 120),
        submitCertificationRequest: (data) => real.submitCertificationRequest(data),
      };
      const proof = await waitInclusionProof(
        new StateTransitionClient(client),
        world.trustBase,
        predicateVerifier,
        createUnicityCertificateVerifier(),
        mint,
        { intervalMs: 5, timeoutMs: 5000 },
      );
      expect(proof.certificationData.transactionHash).toEqual(await mint.calculateTransactionHash());
    });

    it('a proof of another request is a conflict whatever the echo and hint say', async () => {
      const world = await ShardedWorld.create(0);
      const other = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
        salt: TokenSalt.generate(),
        tokenType: TokenType.generate(),
      });
      const real = world.client('');
      await world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(other));
      // the proof of `other`, served for the state id of the awaited transaction
      const awaited = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
        salt: TokenSalt.generate(),
        tokenType: TokenType.generate(),
      });
      const served = await real.getInclusionProof(await StateId.fromTransaction(other));
      const client: IAggregatorClient = {
        getInclusionProof: () => Promise.resolve(served.withWaitedMs(0).withStatusHint('included')),
        submitCertificationRequest: (data) => real.submitCertificationRequest(data),
      };
      await expect(
        waitInclusionProof(
          new StateTransitionClient(client),
          world.trustBase,
          predicateVerifier,
          createUnicityCertificateVerifier(),
          awaited,
          { intervalMs: 5, timeoutMs: 5000 },
        ),
      ).rejects.toThrow(Error);
      // not a success of any kind: a conflict or a failed verification, never a returned proof
      void InclusionProofConflictError;
    });
  });
});
