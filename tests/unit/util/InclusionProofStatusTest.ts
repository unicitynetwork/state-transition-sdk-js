import { CertificationData } from '../../../src/api/CertificationData.js';
import { IAggregatorClient } from '../../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import {
  InclusionProofConflictError,
  InclusionProofExpiredError,
  InclusionProofUnknownError,
} from '../../../src/api/InclusionProofStatusError.js';
import { IInclusionProofRequestOptions } from '../../../src/api/IRequestOptions.js';
import { ProofStatusHint } from '../../../src/api/ProofStatusHint.js';
import { StateId } from '../../../src/api/StateId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { SleepError, waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

jest.setTimeout(60_000);

type Script = (call: number, real: () => Promise<InclusionProofResponse>) => Promise<InclusionProofResponse>;

/** An aggregator over a real in-process shard whose answers (and status hints) a test scripts. */
class Scripted implements IAggregatorClient {
  public readonly options: (IInclusionProofRequestOptions | undefined)[] = [];

  public constructor(
    private readonly real: IAggregatorClient,
    private readonly script: Script,
  ) {}

  public get calls(): number {
    return this.options.length;
  }

  public getInclusionProof(stateId: StateId, options?: IInclusionProofRequestOptions): Promise<InclusionProofResponse> {
    this.options.push(options);
    return this.script(this.options.length, () => this.real.getInclusionProof(stateId, options));
  }

  public submitCertificationRequest(
    certificationData: CertificationData,
  ): ReturnType<IAggregatorClient['submitCertificationRequest']> {
    return this.real.submitCertificationRequest(certificationData);
  }
}

describe('proof status hints in waitInclusionProof', () => {
  const owner = SigningService.generate();
  const predicateVerifier = PredicateVerifierService.create();
  const verifier = createUnicityCertificateVerifier();

  async function setup(): Promise<{
    certify: () => Promise<unknown>;
    transaction: MintTransaction;
    world: ShardedWorld;
  }> {
    const world = await ShardedWorld.create(0);
    const transaction = await MintTransaction.create(world.network, SignaturePredicate.create(owner.publicKey), {
      salt: TokenSalt.generate(),
      tokenType: TokenType.generate(),
    });
    return {
      certify: async () =>
        world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(transaction)),
      transaction,
      world,
    };
  }

  const wait = (
    world: ShardedWorld,
    client: IAggregatorClient,
    transaction: MintTransaction,
    signal: AbortSignal,
    interval = 5,
    options?: { statusHints?: boolean; unknownGraceMs?: number },
  ): ReturnType<typeof waitInclusionProof> =>
    waitInclusionProof(new StateTransitionClient(client), world.trustBase, predicateVerifier, verifier, transaction, {
      intervalMs: interval,
      signal,
      ...options,
    });

  const hint =
    (status: ProofStatusHint | null): Script =>
    (_call, real) =>
      real().then((r) => r.withStatusHint(status));

  it('asks for the status hint on every poll', async () => {
    const { certify, transaction, world } = await setup();
    await certify();
    const client = new Scripted(world.client(''), hint('included'));
    await wait(world, client, transaction, AbortSignal.timeout(5000));
    expect(client.options.every((o) => o?.includeStatusHint === true && o.signal instanceof AbortSignal)).toBe(true);
  });

  it('keeps waiting while the status is pending and returns the verified proof once it exists', async () => {
    const { certify, transaction, world } = await setup();
    const client = new Scripted(world.client(''), async (call, real) => {
      if (call === 4) {
        await certify();
      }
      return real().then((r) => r.withStatusHint(call < 4 ? 'pending' : 'included'));
    });
    const proof = await wait(world, client, transaction, AbortSignal.timeout(5000));
    expect(client.calls).toEqual(4);
    expect(proof.certificationData.transactionHash.equals(await transaction.calculateTransactionHash())).toBe(true);
  });

  it('fails fast with a typed error for expired, without polling on', async () => {
    const { transaction, world } = await setup();
    const client = new Scripted(world.client(''), hint('expired'));
    const error = await wait(world, client, transaction, AbortSignal.timeout(5000)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InclusionProofExpiredError);
    expect(error).toMatchObject({ name: 'InclusionProofExpiredError', status: 'expired' });
    expect((error as InclusionProofExpiredError).stateId.equals(await StateId.fromTransaction(transaction))).toBe(true);
    expect((error as Error).message).toContain('unauthenticated hint');
    expect(client.calls).toEqual(1);
  });

  it('fails fast with a typed error for unknown when no grace is given', async () => {
    const { transaction, world } = await setup();
    const client = new Scripted(world.client(''), hint('unknown'));
    const error = await wait(world, client, transaction, AbortSignal.timeout(5000), 5, { unknownGraceMs: 0 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InclusionProofUnknownError);
    expect(error).toMatchObject({ name: 'InclusionProofUnknownError', status: 'unknown' });
    expect((error as Error).message).toContain('not a proof of absence');
    expect(client.calls).toEqual(1);
  });

  it('rechecks unknown for the grace period (an HA instance that has not seen the request yet)', async () => {
    const { certify, transaction, world } = await setup();
    const client = new Scripted(world.client(''), async (call, real) => {
      if (call === 3) {
        await certify();
      }
      return real().then((r) => r.withStatusHint(call < 3 ? 'unknown' : 'included'));
    });
    await wait(world, client, transaction, AbortSignal.timeout(5000), 5, { unknownGraceMs: 200 });
    expect(client.calls).toEqual(3);
  });

  it('gives up on an unknown that outlasts the grace, which defaults to two intervals', async () => {
    const { transaction, world } = await setup();
    const client = new Scripted(world.client(''), hint('unknown'));
    const error = await wait(world, client, transaction, AbortSignal.timeout(5000), 20).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InclusionProofUnknownError);
    expect(client.calls).toBeGreaterThanOrEqual(2);
    expect(client.calls).toBeLessThanOrEqual(5);
  });

  it('behaves as before without a status, and for a status it does not know', async () => {
    const { transaction, world } = await setup();
    for (const status of [null, 'future-status' as unknown as ProofStatusHint]) {
      const client = new Scripted(world.client(''), hint(status));
      await expect(wait(world, client, transaction, AbortSignal.timeout(120))).rejects.toThrow(SleepError);
      expect(client.calls).toBeGreaterThan(2);
    }
  });

  it('keeps polling on included without a proof: the hint alone never ends a wait successfully', async () => {
    const { transaction, world } = await setup();
    const client = new Scripted(world.client(''), hint('included'));
    await expect(wait(world, client, transaction, AbortSignal.timeout(100))).rejects.toThrow(SleepError);
  });

  it('verifies a proof that is present whatever the status says', async () => {
    const { certify, transaction, world } = await setup();
    await certify();
    for (const status of ['expired', 'unknown', 'pending'] as const) {
      const client = new Scripted(world.client(''), hint(status));
      const proof = await wait(world, client, transaction, AbortSignal.timeout(5000), 5, { unknownGraceMs: 0 });
      expect(proof.certificationData.transactionHash.equals(await transaction.calculateTransactionHash())).toBe(true);
      expect(client.calls).toEqual(1);
    }
  });

  it('does not turn the abort into a status error', async () => {
    const { transaction, world } = await setup();
    const controller = new AbortController();
    const client = new Scripted(world.client(''), (call, real) => {
      if (call === 2) {
        controller.abort(new Error('deadline'));
      }
      return real().then((r) => r.withStatusHint('pending'));
    });
    await expect(wait(world, client, transaction, controller.signal)).rejects.toThrow(SleepError);
  });

  it('reports a conflicting submission: the certified request for the state id is another one', async () => {
    const world = await ShardedWorld.create(0);
    const salt = TokenSalt.generate();
    const tokenType = TokenType.generate();
    const mint = (recipient: SigningService): Promise<MintTransaction> =>
      MintTransaction.create(world.network, SignaturePredicate.create(recipient.publicKey), { salt, tokenType });
    // the same salt gives the same state id: R1 pays one recipient, R2 another, the queue admits only the first
    const first = await mint(owner);
    const second = await mint(SigningService.generate());
    expect((await StateId.fromTransaction(first)).equals(await StateId.fromTransaction(second))).toBe(true);
    expect((await first.calculateTransactionHash()).equals(await second.calculateTransactionHash())).toBe(false);
    await world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(first));

    const client = new Scripted(world.client(''), hint('included'));
    const error = await wait(world, client, second, AbortSignal.timeout(5000)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InclusionProofConflictError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'InclusionProofConflictError', reason: 'TRANSACTION_HASH_MISMATCH' });
    // legacy text kept
    expect((error as Error).message).toContain('Invalid inclusion proof status: TRANSACTION_HASH_MISMATCH');
    // the proof is carried (certifying the first request) but it has not been authenticated yet
    expect(
      (error as InclusionProofConflictError).unverifiedInclusionProof.certificationData.transactionHash.equals(
        await first.calculateTransactionHash(),
      ),
    ).toBe(true);

    // the first transaction's own wait is unaffected
    expect(
      (await wait(world, new Scripted(world.client(''), hint('included')), first, AbortSignal.timeout(5000)))
        .referenceTime,
    ).toBeGreaterThan(0n);
  });

  it('keeps the generic error for other verification failures', async () => {
    const { certify, transaction, world } = await setup();
    await certify();
    // verified against another authority: the proof matches the transaction, its seal does not verify
    const other = await ShardedWorld.create(0);
    const error = await waitInclusionProof(
      new StateTransitionClient(world.client('')),
      other.trustBase,
      predicateVerifier,
      verifier,
      transaction,
      AbortSignal.timeout(5000),
      5,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(InclusionProofConflictError);
    expect((error as Error).message).toContain('Invalid inclusion proof status');
  });
});
