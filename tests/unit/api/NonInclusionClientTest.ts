import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import {
  OperationUnicityCertificateVerifier,
  UnicityCertificateVerifier,
} from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import {
  fetchMembershipEvidence,
  INonInclusionAggregatorClient,
  isNonInclusionAggregatorClient,
} from '../../../src/api/INonInclusionAggregatorClient.js';
import { JsonRpcDataError } from '../../../src/api/json-rpc/JsonRpcDataError.js';
import { JsonRpcNetworkError } from '../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { NonInclusionProof } from '../../../src/api/NonInclusionProof.js';
import { NonInclusionProofError } from '../../../src/api/NonInclusionProofError.js';
import { verifyNonInclusion, VerifiedAbsence } from '../../../src/api/NonInclusionVerification.js';
import { ProofStatusHint } from '../../../src/api/ProofStatusHint.js';
import { SdkError } from '../../../src/api/SdkError.js';
import { StateId } from '../../../src/api/StateId.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { IVerificationContext } from '../../../src/transaction/verification/IVerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';

const ROOT = join(process.cwd(), 'tests/fixtures/non-inclusion/v1');
const golden = JSON.parse(readFileSync(join(ROOT, 'cases/golden-two-leaf.json'), 'utf8')) as {
  query: string;
  wrapper: string;
};
const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(HexConverter.decode(golden.query)));
const trustBase = RootTrustBase.fromJSON(JSON.parse(readFileSync(join(ROOT, 'authority/trust-base.json'), 'utf8')));
const verifier = new UnicityCertificateVerifier(
  new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
);

/** The context as a class: its members are #private getters, reading them with a wrong receiver throws. */
class PrivateGetterContext {
  readonly #trustBase: RootTrustBase;
  readonly #verifier: UnicityCertificateVerifier;

  public constructor() {
    this.#trustBase = trustBase;
    this.#verifier = verifier;
  }

  public get trustBase(): RootTrustBase {
    return this.#trustBase;
  }

  public get unicityCertificateVerifier(): UnicityCertificateVerifier {
    return this.#verifier;
  }
}

function respondWith(body: (id: string) => unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const id = (JSON.parse(init?.body as string) as { id: string }).id;
    return Promise.resolve(new Response(JSON.stringify(body(id)), { status }));
  });
}

describe('AggregatorClient.getNonInclusionProof', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('is an optional capability next to the unchanged required interface', () => {
    expect(isNonInclusionAggregatorClient(client)).toBe(true);
    expect(
      isNonInclusionAggregatorClient({ getInclusionProof: jest.fn(), submitCertificationRequest: jest.fn() }),
    ).toBe(false);
  });

  it('sends the dedicated method with the state id, decodes the proof bound to that state and verifies it', async () => {
    const fetchMock = respondWith((id) => ({ id, jsonrpc: '2.0', result: golden.wrapper }));
    const answer = await client.getNonInclusionProof(stateId);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({
      method: 'get_non_inclusion_proof.v1',
      params: { stateId: golden.query },
    });
    expect(answer.kind).toEqual('absence_proof');
    if (answer.kind !== 'absence_proof') {
      return;
    }
    expect(answer.proof.stateId).toBe(stateId);
    const result = await verifyNonInclusion(answer.proof, new PrivateGetterContext(), { expectedPartition: 161n });
    expect(result.status).toEqual(VerificationStatus.OK);
    if (result.status === VerificationStatus.OK) {
      expect(result.absence).toBeInstanceOf(VerifiedAbsence);
      expect(result.absence.stateId).toBe(stateId);
      expect(result.absence.absentAtRound).toBeGreaterThan(0n);
      expect(result.absence.stateRoot).toHaveLength(32);
    }
  });

  describe('server outcomes are the same over every HTTP status', () => {
    const envelope =
      (code: number, data?: unknown) =>
      (id: string): unknown => ({ error: { code, data, message: 'm' }, id, jsonrpc: '2.0' });

    it.each([200, 404, 409, 429, 500])('-32020 unavailable (HTTP %i)', async (status) => {
      respondWith(envelope(-32020), status);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({
        kind: 'unavailable',
        retryable: true,
      });
    });

    it.each([200, 404, 409, 429])('-32022 is a claim, returned as a value (HTTP %i)', async (status) => {
      respondWith(envelope(-32022), status);
      await expect(client.getNonInclusionProof(stateId)).resolves.toEqual({ kind: 'state_included_hint' });
    });

    it.each([200, 429])('-32023 busy (HTTP %i)', async (status) => {
      respondWith(envelope(-32023), status);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'busy', retryable: true });
    });

    it('keeps unknown codes and maps the standard ones', async () => {
      respondWith(envelope(-32099));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ code: -32099, kind: 'server' });
      respondWith(envelope(-32602));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ code: -32602, kind: 'rejected' });
    });

    it('treats anything that is not a complete matching envelope as transport or invalid, never as a claim', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<html>not found</html>', { status: 404 }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'transport', retryable: true });
      respondWith(() => ({ error: { code: -32022, message: 'm' }, id: 'someone-else', jsonrpc: '2.0' }), 409);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'transport' });
      respondWith((id) => ({ error: { code: -32022, message: 'm' }, id, jsonrpc: '1.0' }), 409);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'transport' });
      respondWith(() => ({ error: { code: -32022, message: 'm' }, id: 'someone-else', jsonrpc: '2.0' }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
      respondWith((id) => ({ error: { code: -32022, message: 'm' }, id, jsonrpc: '2.0', result: golden.wrapper }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
      respondWith((id) => ({ id, jsonrpc: '2.0', result: { proof: golden.wrapper } }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
    });

    it('rejects a result that is not a bounded, well formed proof', async () => {
      respondWith((id) => ({ id, jsonrpc: '2.0', result: 'zz' }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
      respondWith((id) => ({ id, jsonrpc: '2.0', result: 'ab'.repeat(NonInclusionProof.MAX_WIRE_BYTES + 1) }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
    });
  });

  describe('one call, and the signal is honoured even by a transport that ignores it', () => {
    const hanging = (): jest.SpyInstance =>
      jest.spyOn(global, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));

    it('rejects on cancel with the caller reason as the cause', async () => {
      hanging();
      const controller = new AbortController();
      const reason = new Error('navigated away');
      setTimeout(() => controller.abort(reason), 20);
      const error = (await client
        .getNonInclusionProof(stateId, { signal: controller.signal })
        .catch((e: unknown) => e)) as NonInclusionProofError;
      expect(error).toMatchObject({ kind: 'cancelled', retryable: false });
      expect(error.cause).toBe(reason);
    });

    it('reports AbortSignal.timeout as a timeout with its reason', async () => {
      hanging();
      const signal = AbortSignal.timeout(50);
      const error = (await client
        .getNonInclusionProof(stateId, { signal })
        .catch((e: unknown) => e)) as NonInclusionProofError;
      expect(error.kind).toEqual('timeout');
      expect(error.cause).toBe(signal.reason);
    });

    it('makes exactly one request, no polling', async () => {
      const fetchMock = respondWith((id) => ({ error: { code: -32020, message: 'm' }, id, jsonrpc: '2.0' }));
      await client.getNonInclusionProof(stateId).catch(() => undefined);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('membership evidence', () => {
    it('is two independent calls and returns unverified evidence of the kind the service chose', async () => {
      const inclusion = jest.fn(() => Promise.resolve(InclusionProofResponse.fromCBOR(new Uint8Array())));
      const absent = await fetchMembershipEvidence(
        {
          getInclusionProof: inclusion,
          getNonInclusionProof: () =>
            Promise.resolve({
              kind: 'absence_proof',
              proof: NonInclusionProof.decode(stateId, HexConverter.decode(golden.wrapper)),
            }),
          submitCertificationRequest: jest.fn(),
        },
        stateId,
      );
      expect(absent.kind).toEqual('absence');
      expect(inclusion).not.toHaveBeenCalled();
    });

    const claiming = (
      inclusion: INonInclusionAggregatorClient['getInclusionProof'],
    ): INonInclusionAggregatorClient => ({
      getInclusionProof: inclusion,
      getNonInclusionProof: () => Promise.resolve({ kind: 'state_included_hint' }),
      submitCertificationRequest: jest.fn(),
    });

    it('treats a claimed inclusion without a proof yet as a retryable race, not a bad response', async () => {
      const client = claiming(() => Promise.resolve({ inclusionProof: null } as unknown as InclusionProofResponse));
      await expect(fetchMembershipEvidence(client, stateId)).rejects.toMatchObject({
        kind: 'unavailable',
        retryable: true,
      });
    });

    it('types every failure of the second call like the first, and bounds it by the signal', async () => {
      await expect(
        fetchMembershipEvidence(
          claiming(() => Promise.reject(new JsonRpcNetworkError(502, 'bad gateway'))),
          stateId,
        ),
      ).rejects.toMatchObject({ kind: 'transport', retryable: true });
      await expect(
        fetchMembershipEvidence(
          claiming(() => Promise.reject(new JsonRpcDataError({ code: -32023, message: 'busy' }))),
          stateId,
        ),
      ).rejects.toMatchObject({ kind: 'busy' });

      // a second call that ignores the signal and never answers
      const controller = new AbortController();
      const reason = new Error('stop');
      setTimeout(() => controller.abort(reason), 20);
      const error = (await fetchMembershipEvidence(
        claiming(() => new Promise(() => undefined)),
        stateId,
        {
          signal: controller.signal,
        },
      ).catch((e: unknown) => e)) as NonInclusionProofError;
      expect(error).toMatchObject({ kind: 'cancelled' });
      expect(error.cause).toBe(reason);
    });
  });
});

describe('non-inclusion API shape', () => {
  const proof = NonInclusionProof.decode(stateId, HexConverter.decode(golden.wrapper));

  it('keeps decoded material, the evidence and the status hint apart at the type level', async () => {
    const verified = await verifyNonInclusion(proof, new PrivateGetterContext(), { expectedPartition: 161n });
    const hint: ProofStatusHint = 'unknown';
    // @ts-expect-error decoded wire material is not evidence
    const asEvidence: VerifiedAbsence = proof;
    // @ts-expect-error a status hint is not evidence
    const hintAsEvidence: VerifiedAbsence = hint;
    // @ts-expect-error evidence is not decoded material
    const evidenceAsProof: NonInclusionProof = verified.absence;
    // @ts-expect-error a status hint is not decoded material
    const hintAsProof: NonInclusionProof = hint;
    // @ts-expect-error absence only exists after narrowing on status
    const bare: VerifiedAbsence = verified.absence;
    expect([asEvidence, hintAsEvidence, evidenceAsProof, hintAsProof, bare]).toHaveLength(5);
    expect(verified.status).toEqual(VerificationStatus.OK);
  });

  it('cannot be forged: the evidence has no public constructor path', () => {
    expect(() => new VerifiedAbsence(Symbol('x'), stateId, 1n, null)).toThrow(TypeError);
    expect(Object.isFrozen(proof.certificate)).toBe(false); // decoded data is a copy, never shared state
  });

  it('owns its bytes', () => {
    const bytes = HexConverter.decode(golden.wrapper);
    const decoded = NonInclusionProof.decode(stateId, bytes);
    bytes.fill(0);
    expect(decoded.toCBOR()).toEqual(HexConverter.decode(golden.wrapper));
    const copy = decoded.certificate.toBytes();
    copy.fill(7);
    expect(decoded.certificate.toBytes()).not.toEqual(copy);
  });

  it('rejects a context that is not what the verification session was anchored to', async () => {
    const other = RootTrustBase.fromJSON(JSON.parse(readFileSync(join(ROOT, 'authority/other-network.json'), 'utf8')));
    const { SealVerificationSession } = await import('../../../src/api/bft/verification/SealVerificationSession.js');
    const session = new SealVerificationSession(other, verifier.quorumRule);
    await expect(
      verifyNonInclusion(proof, new PrivateGetterContext(), { expectedPartition: 161n, session }),
    ).rejects.toThrow(TypeError);
  });

  it('errors are SdkErrors with a literal name that survive another copy of the SDK', () => {
    const e = new NonInclusionProofError('busy', 'x', { retryable: true });
    expect(e.name).toEqual('NonInclusionProofError');
    expect(SdkError.is(e)).toBe(true);
    expect(NonInclusionProofError.is(e)).toBe(true);
    expect(NonInclusionProofError.is(new Error('x'))).toBe(false);
    const context: IVerificationContext['trustBase'] = trustBase;
    expect(context).toBeDefined();
  });

  it('shares the seal session of an operation scoped verifier: a seal is checked once, no extra knob', async () => {
    const operation = verifier.beginOperation();
    const context = { trustBase, unicityCertificateVerifier: operation };
    const first = await verifyNonInclusion(proof, context, { expectedPartition: 161n });
    const second = await verifyNonInclusion(proof, context, { expectedPartition: 161n });
    expect([first.status, second.status]).toEqual([VerificationStatus.OK, VerificationStatus.OK]);
    expect((operation as OperationUnicityCertificateVerifier).stats.quorumChecks).toEqual(1);
  });
});
