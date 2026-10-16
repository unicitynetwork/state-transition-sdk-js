import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import {
  InclusionProofConflictError,
  InclusionProofExpiredError,
  InclusionProofStatusError,
  InclusionProofUnknownError,
  InclusionProofWaitError,
} from '../../../src/api/InclusionProofStatusError.js';
import { IInclusionProofRequestOptions } from '../../../src/api/IRequestOptions.js';
import { ProofStatusHint } from '../../../src/api/ProofStatusHint.js';
import { SdkError } from '../../../src/api/SdkError.js';
import { StateId } from '../../../src/api/StateId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { SleepError, waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { scenario } from '../../utils/ConsolidationScenario.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

jest.setTimeout(60_000);

const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32).fill(7)));

/** Type-level pins: these lines must keep failing to compile, `tsc` (part of lint/test) fails when they stop doing so. */
function typePins(
  response: InclusionProofResponse,
  wait: InclusionProofWaitError,
  expired: InclusionProofExpiredError,
): void {
  // the hint is never called `status`: that name is for authoritative results (CertificationResponse.status)
  // @ts-expect-error no `status` on a proof response
  void response.status;
  // @ts-expect-error a hint is not assignable to anything that expects a verified value
  const notEvidence: { readonly inclusionProof: unknown } = response.statusHint;
  void notEvidence;
  // the narrowed hint of the error is its literal
  const e: 'expired' = expired.status;
  void e;
  // @ts-expect-error the conflict error is not a hint error: no `status`
  void (wait as InclusionProofConflictError).status;
}
void typePins;

describe('the proof status hint is named a hint', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('is statusHint on the response and includeStatusHint in the options, the wire parameter stays includeStatus', async () => {
    const world = await ShardedWorld.create(0);
    const proof = (await world.client('').getInclusionProof(stateId)).toCBOR();
    const spy = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id,
            jsonrpc: '2.0',
            result: { proof: Buffer.from(proof).toString('hex'), status: 'pending' },
          }),
        ),
      );
    });
    const options: IInclusionProofRequestOptions = { includeStatusHint: true };
    const response = await client.getInclusionProof(stateId, options);
    expect(response.statusHint).toEqual('pending' satisfies ProofStatusHint);
    expect((spy.mock.calls as [string, { body: string }][])[0][1].body).toContain('"includeStatus":true');
    expect(Object.keys(response)).not.toContain('status');
    expect((response as unknown as { status?: unknown }).status).toBeUndefined();
  });
});

describe('waiting errors form one family with typed discriminants', () => {
  const id = stateId;
  const proofOf = async (): Promise<ConstructorParameters<typeof InclusionProofConflictError>[2]> => {
    const s = await scenario(0);
    return (await s.history(0)).genesis.inclusionProof;
  };

  it('one base catches all three, with a literal code and a resubmittable flag', async () => {
    const errors: InclusionProofWaitError[] = [
      new InclusionProofExpiredError(id),
      new InclusionProofUnknownError(id, 5),
      new InclusionProofConflictError('TRANSACTION_HASH_MISMATCH' as never, id, await proofOf()),
    ];
    expect(errors.map((e) => e instanceof InclusionProofWaitError)).toEqual([true, true, true]);
    expect(errors.map((e) => e.code)).toEqual(['expired', 'unknown', 'conflict']);
    expect(errors.map((e) => e.resubmittable)).toEqual([true, true, false]);
    expect(errors.map((e) => e.name)).toEqual([
      'InclusionProofExpiredError',
      'InclusionProofUnknownError',
      'InclusionProofConflictError',
    ]);
    // only the hint-driven ones are status errors, and they carry the literal hint
    expect(errors.map((e) => e instanceof InclusionProofStatusError)).toEqual([true, true, false]);
    expect((errors[0] as InclusionProofStatusError).status).toEqual('expired');
    expect((errors[1] as InclusionProofStatusError).status).toEqual('unknown');
    expect(errors.every((e) => e.stateId.equals(id))).toBe(true);
  });

  it('is recognized across copies of the SDK by the brand, and by name', () => {
    const error = new InclusionProofExpiredError(id);
    // another copy of the SDK: same registry symbol, different class identity
    const foreign = Object.assign(Object.create(Error.prototype) as Error, {
      [Symbol.for('@unicitylabs/state-transition-sdk/error')]: true,
      name: 'InclusionProofExpiredError',
    });
    expect(foreign instanceof InclusionProofExpiredError).toBe(false);
    expect(SdkError.is(foreign)).toBe(true);
    expect(SdkError.is(error)).toBe(true);
    expect(SdkError.is(new Error('x'))).toBe(false);
    expect(SdkError.is(null)).toBe(false);
  });

  it('the conflict carries an explicitly unverified proof', async () => {
    const proof = await proofOf();
    const error = new InclusionProofConflictError('CERTIFICATION_DATA_MISMATCH' as never, id, proof);
    expect(error.unverifiedInclusionProof).toBe(proof);
    expect((error as unknown as { inclusionProof?: unknown }).inclusionProof).toBeUndefined();
    expect(error.message).toContain('Invalid inclusion proof status: CERTIFICATION_DATA_MISMATCH');
  });
});

describe('waitInclusionProof options', () => {
  const owner = SigningService.generate();
  const predicateVerifier = PredicateVerifierService.create();
  const verifier = createUnicityCertificateVerifier();

  class Recording implements IAggregatorClient {
    public readonly options: (IInclusionProofRequestOptions | undefined)[] = [];

    public constructor(
      private readonly real: IAggregatorClient,
      private readonly hint: ProofStatusHint | null,
    ) {}

    public async getInclusionProof(
      id: StateId,
      options?: IInclusionProofRequestOptions,
    ): Promise<InclusionProofResponse> {
      this.options.push(options);
      return (await this.real.getInclusionProof(id, options)).withStatusHint(this.hint);
    }

    public submitCertificationRequest(
      data: CertificationData,
    ): ReturnType<IAggregatorClient['submitCertificationRequest']> {
      return this.real.submitCertificationRequest(data);
    }
  }

  async function pending(): Promise<{ transaction: MintTransaction; world: ShardedWorld }> {
    const world = await ShardedWorld.create(0);
    const transaction = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
      salt: TokenSalt.generate(),
      tokenType: TokenType.generate(),
    });
    return { transaction, world };
  }

  it('takes one options object, no placeholders for the defaults', async () => {
    const { transaction, world } = await pending();
    const client = new Recording(world.client(''), 'expired');
    await expect(
      waitInclusionProof(new StateTransitionClient(client), world.trustBase, predicateVerifier, verifier, transaction, {
        intervalMs: 5,
        unknownGraceMs: 0,
      }),
    ).rejects.toBeInstanceOf(InclusionProofExpiredError);
    expect(client.options[0]?.includeStatusHint).toBe(true);
  });

  it('statusHints: false is exactly the SDK 3.0 behavior: no hint requested, hints never end the wait', async () => {
    const { transaction, world } = await pending();
    for (const hint of ['expired', 'unknown'] as const) {
      const client = new Recording(world.client(''), hint);
      await expect(
        waitInclusionProof(
          new StateTransitionClient(client),
          world.trustBase,
          predicateVerifier,
          verifier,
          transaction,
          {
            intervalMs: 5,
            signal: AbortSignal.timeout(120),
            statusHints: false,
            unknownGraceMs: 0,
          },
        ),
      ).rejects.toThrow(SleepError);
      expect(client.options.length).toBeGreaterThan(2);
      expect(client.options.every((o) => o?.includeStatusHint === undefined)).toBe(true);
    }
  });

  it('keeps the positional form of 3.0: signal and interval, never asking for hints', async () => {
    const { transaction, world } = await pending();
    const client = new Recording(world.client(''), 'expired');
    await expect(
      waitInclusionProof(
        new StateTransitionClient(client),
        world.trustBase,
        predicateVerifier,
        verifier,
        transaction,
        AbortSignal.timeout(100),
        5,
      ),
    ).rejects.toThrow(SleepError);
    expect(client.options.every((o) => o?.includeStatusHint === undefined)).toBe(true);
    // a signal wrapper exposing only the AbortSignal surface is still a signal, not an options object
    const controller = new AbortController();
    const wrapper = {
      get aborted(): boolean {
        return controller.signal.aborted;
      },
      addEventListener: controller.signal.addEventListener.bind(controller.signal),
      reason: undefined,
      removeEventListener: controller.signal.removeEventListener.bind(controller.signal),
    } as unknown as AbortSignal;
    setTimeout(() => controller.abort(), 50);
    await expect(
      waitInclusionProof(
        new StateTransitionClient(new Recording(world.client(''), null)),
        world.trustBase,
        predicateVerifier,
        verifier,
        transaction,
        wrapper,
      ),
    ).rejects.toThrow(SleepError);
  });
});

describe('duplicate submissions are classified narrowly', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  const failWith = (data: string): void => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: -32603, data, message: 'Failed to submit certification request' },
            id,
            jsonrpc: '2.0',
          }),
        ),
      );
    });
  };

  it('only a duplicate on the state id index; a duplicate on another index is a failure', async () => {
    const s = await scenario(0);
    const data = (await s.history(0)).genesis.inclusionProof.certificationData;
    failWith('write errors: [E11000 duplicate key error collection: a.b index: stateId_1 dup key: { stateId: "ab" }]');
    expect((await client.submitCertificationRequest(data)).status).toEqual(CertificationStatus.STATE_ID_QUEUED);
    failWith('write errors: [E11000 duplicate key error collection: a.b index: blockNumber_1 dup key: { n: 1 }]');
    await expect(client.submitCertificationRequest(data)).rejects.toMatchObject({ code: -32603 });
    failWith('duplicate key');
    await expect(client.submitCertificationRequest(data)).rejects.toMatchObject({ code: -32603 });
  });
});

describe('the offending index classes are a closed set', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('keeps the four classes and drops anything else', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: -32008,
              data: {
                detail: 'state_unknown',
                indexes: { __proto__: [9], expired: [2], pendnig: [0], unknown: [1] },
                retryable: false,
              },
              message: 'Proof unavailable',
            },
            id,
            jsonrpc: '2.0',
          }),
        ),
      );
    });
    const error = (await client.getInclusionProofs([stateId]).catch((e: unknown) => e)) as BatchProofError;
    expect(error.indexesByClass).toEqual({ expired: [2], unknown: [1] });
    // typed keys: a misspelling does not compile
    // @ts-expect-error not a class of offending indexes
    void error.indexesByClass?.pendnig;
  });
});
