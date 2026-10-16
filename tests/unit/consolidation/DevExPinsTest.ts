import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { InputRecord } from '../../../src/api/bft/InputRecord.js';
import { PartitionViewError } from '../../../src/api/bft/PartitionViewError.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { IBatchAggregatorClient } from '../../../src/api/IBatchAggregatorClient.js';
import { SdkError } from '../../../src/api/SdkError.js';
import { ConsolidationError } from '../../../src/consolidation/ConsolidationError.js';
import { IShardEndpoint, ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { IVerificationContext } from '../../../src/transaction/verification/IVerificationContext.js';
import { IScenario, scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(60_000);

/** A transport that never answers and ignores the abort signal, like a socket in a stalled network. */
function hanging(real: IBatchAggregatorClient): IBatchAggregatorClient {
  const never = (): Promise<never> => new Promise<never>(() => undefined);
  return {
    getInclusionProof: (id, o) => real.getInclusionProof(id, o),
    getInclusionProofs: never,
    submitCertificationRequest: (d) => real.submitCertificationRequest(d),
  };
}

function routingWith(s: IScenario, wrap: (c: IBatchAggregatorClient) => IBatchAggregatorClient): ShardRouting {
  return new ShardRouting({
    endpoints: s.world.bits.map((b): IShardEndpoint => ({
      client: wrap(s.world.client(b)),
      shard: shardIdFromBits(b),
    })),
    partitionId: WORLD_PARTITION,
    scheme: s.world.scheme,
  });
}

/** A context whose members are `#private` getters: reading them with the wrong receiver throws. */
class PrivateGetterContext implements IVerificationContext {
  readonly #inner: IVerificationContext;

  public constructor(inner: IVerificationContext) {
    this.#inner = inner;
  }

  public get mintJustificationVerifier(): IVerificationContext['mintJustificationVerifier'] {
    return this.#inner.mintJustificationVerifier;
  }

  public get predicateVerifier(): IVerificationContext['predicateVerifier'] {
    return this.#inner.predicateVerifier;
  }

  public get tokenIssuanceVerifier(): IVerificationContext['tokenIssuanceVerifier'] {
    return this.#inner.tokenIssuanceVerifier;
  }

  public get trustBase(): IVerificationContext['trustBase'] {
    return this.#inner.trustBase;
  }

  public get unicityCertificateVerifier(): IVerificationContext['unicityCertificateVerifier'] {
    return this.#inner.unicityCertificateVerifier;
  }
}

describe('Developer experience pins', () => {
  it('works with a verification context whose members are #private getters (a class, not a bag of fields)', async () => {
    const s = await scenario(1);
    const token = await s.history(3);
    const context = new PrivateGetterContext(s.context);
    expect((await token.verify(context)).status).toEqual('OK');
    const proofs = new TokenProofClient({
      routing: routingWith(s, (c) => c),
      verificationContext: context,
    });
    const result = await proofs.consolidate(token);
    expect(result.status).toEqual('consolidated');
  });

  describe('a transport that never answers and ignores the signal', () => {
    it('ends at timeoutMs with a retryable timeout', async () => {
      const s = await scenario(1);
      const token = await s.history(3);
      const proofs = new TokenProofClient({ routing: routingWith(s, hanging), verificationContext: s.context });
      const started = Date.now();
      const error = await proofs.consolidate(token, { timeoutMs: 300 }).catch((e: unknown) => e);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(error).toBeInstanceOf(ConsolidationError);
      expect(error).toMatchObject({ kind: 'timeout', retryable: true });
    });

    it('ends at once on cancel, with the caller reason as the cause', async () => {
      const s = await scenario(1);
      const token = await s.history(3);
      const proofs = new TokenProofClient({ routing: routingWith(s, hanging), verificationContext: s.context });
      const controller = new AbortController();
      const reason = new Error('user navigated away');
      setTimeout(() => controller.abort(reason), 50);
      const error = (await proofs
        .consolidate(token, { signal: controller.signal, timeoutMs: 30_000 })
        .catch((e: unknown) => e)) as ConsolidationError;
      expect(error).toMatchObject({ kind: 'cancelled', retryable: false });
      expect(error.cause).toBe(reason);
    });

    it('reports a caller deadline (AbortSignal.timeout) as a timeout, not as a cancellation', async () => {
      const s = await scenario(1);
      const token = await s.history(3);
      const proofs = new TokenProofClient({ routing: routingWith(s, hanging), verificationContext: s.context });
      const signal = AbortSignal.timeout(100);
      const error = (await proofs
        .consolidate(token, { signal, timeoutMs: 30_000 })
        .catch((e: unknown) => e)) as ConsolidationError;
      expect(error.kind).toEqual('timeout');
      expect(error.cause).toBe(signal.reason);
    });
  });

  it('refuses an endpoint without the batch capability at construction, with a typed error naming the shard', async () => {
    const s = await scenario(1);
    const endpoints = s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardIdFromBits(b) }));
    const plain = { getInclusionProof: jest.fn(), submitCertificationRequest: jest.fn() };
    // the type already refuses it for TypeScript callers
    const typed: IShardEndpoint = {
      // @ts-expect-error a client with only the base methods is not an IBatchAggregatorClient
      client: plain,
      shard: ShardId.ROOT,
    };
    expect(typed).toBeDefined();
    expect(
      () =>
        new ShardRouting({
          endpoints: [{ client: plain as never, shard: endpoints[0].shard }, ...endpoints.slice(1)],
          partitionId: WORLD_PARTITION,
          scheme: s.world.scheme,
        }),
    ).toThrow(/shard "0"/);
  });

  describe('errors', () => {
    it('are SdkErrors that narrow through is() and name, also across copies of the SDK', () => {
      const errors = [
        new ConsolidationError('timeout', 'x'),
        new BatchProofError('unavailable', 'x'),
        new PartitionViewError('topology', 'x'),
      ];
      expect(errors.map((e) => e.name)).toEqual(['ConsolidationError', 'BatchProofError', 'PartitionViewError']);
      for (const e of errors) {
        expect(SdkError.is(e)).toBe(true);
      }
      // a copy from another bundle shares the brand but not the class
      const foreign = Object.assign(new Error('x'), { name: 'ConsolidationError' });
      Object.defineProperty(foreign, Symbol.for('@unicitylabs/state-transition-sdk/error'), { value: true });
      expect(ConsolidationError.is(foreign)).toBe(true);
      expect(BatchProofError.is(foreign)).toBe(false);
      expect(ConsolidationError.is(new Error('x'))).toBe(false);
    });

    it('carry an outcome only for the kinds that have one', () => {
      expect(new ConsolidationError('timeout', 'x', { outcome: 'invalid_input' }).outcome).toBeUndefined();
      expect(new ConsolidationError('input', 'x', { outcome: 'invalid_input' }).failure).toEqual({
        kind: 'input',
        outcome: 'invalid_input',
      });
      const failure = new ConsolidationError('transport', 'x').failure;
      // @ts-expect-error the outcome is not reachable without narrowing the kind to input or integrity
      const outcome: string = failure.outcome;
      expect(outcome).toBeUndefined();
    });

    it('name the shard as a ShardId', () => {
      const shard = ShardId.fromBits('01');
      expect(new ConsolidationError('integrity', 'x', { outcome: 'binding_mismatch', shard }).shard).toBe(shard);
    });
  });

  describe('InputRecord null versus empty', () => {
    const record = (hash: Uint8Array | null): InputRecord =>
      new InputRecord(1n, 1n, null, hash, null, 1n, null, 0n, null);

    it('tells CBOR null from a value', () => {
      expect(record(null).nullableHash).toBeNull();
      expect(record(new Uint8Array(32).fill(1)).nullableHash).toEqual(new Uint8Array(32).fill(1));
    });
  });

  it('builds shard ids from bit strings', () => {
    expect(ShardId.fromBits('').equals(ShardId.ROOT)).toBe(true);
    expect(ShardId.fromBits('01').toString()).toEqual('01');
    expect(() => ShardId.fromBits('012')).toThrow(RangeError);
  });
});
