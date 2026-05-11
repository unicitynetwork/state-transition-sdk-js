import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { StateId } from '../../../src/api/StateId.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

/**
 * PR #110 68dc549 introduced the X-State-ID header on submit_commitment. The first
 * implementation used `request.stateId.toString()` which wraps hex with `StateId[…]`,
 * breaking the subscription proxy that expects raw hex. We patched it to use
 * HexConverter.encode(...) directly. This test pins the header to bare hex so the
 * regression cannot sneak back.
 */
describe('AggregatorClient X-State-ID header', () => {
  const originalFetch = globalThis.fetch;
  let captured: { body?: string; headers?: Headers } = {};

  beforeEach(() => {
    captured = {};
    globalThis.fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      captured.headers = init?.headers as Headers;
      captured.body = init?.body as string;
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'test', jsonrpc: '2.0', result: { status: 'SUCCESS' } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends X-State-ID as bare hex without StateId[...] wrapper', async () => {
    const client = new AggregatorClient('http://test.invalid', null);
    const recipient = SignaturePredicate.create(
      HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
    );
    const mintTx = await MintTransaction.create(
      recipient,
      new TokenId(new Uint8Array(32)),
      new TokenType(new Uint8Array(32)),
    );
    const certData = await CertificationData.fromMintTransaction(mintTx);

    await client.submitCertificationRequest(certData);

    const stateIdHeader = captured.headers!.get('X-State-ID');
    expect(stateIdHeader).not.toBeNull();
    expect(stateIdHeader).not.toContain('StateId[');
    expect(stateIdHeader).not.toContain(']');
    expect(stateIdHeader).toMatch(/^[0-9a-fA-F]+$/);
  });

  it('does not send X-API-Key when no key is provided', async () => {
    const client = new AggregatorClient('http://test.invalid', null);
    const recipient = SignaturePredicate.create(
      HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
    );
    const mintTx = await MintTransaction.create(
      recipient,
      new TokenId(new Uint8Array(32)),
      new TokenType(new Uint8Array(32)),
    );
    const certData = await CertificationData.fromMintTransaction(mintTx);

    await client.submitCertificationRequest(certData);

    expect(captured.headers!.get('X-API-Key')).toBeNull();
  });

  it('sends X-API-Key when a key is provided', async () => {
    const client = new AggregatorClient('http://test.invalid', 'secret-key-abc');
    const recipient = SignaturePredicate.create(
      HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
    );
    const mintTx = await MintTransaction.create(
      recipient,
      new TokenId(new Uint8Array(32)),
      new TokenType(new Uint8Array(32)),
    );
    const certData = await CertificationData.fromMintTransaction(mintTx);

    await client.submitCertificationRequest(certData);

    expect(captured.headers!.get('X-API-Key')).toEqual('secret-key-abc');
  });

  // PR #110 commit 59f39b5 fixed only submitCertificationRequest. getInclusionProof has the
  // same risk surface (StateId leaking onto the wire as `StateId[<hex>]`) but uses the
  // JSON-RPC params object instead of an HTTP header. This test pins the bare-hex shape on
  // that endpoint too so a future refactor can't silently regress it.
  it('sends getInclusionProof stateId as bare hex in JSON-RPC params', async () => {
    // Stub the upstream once with a minimal valid InclusionProofResponse CBOR payload.
    // The aggregator-side response shape doesn't matter for the wire-format assertion;
    // we only inspect the outgoing body.
    globalThis.fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      captured.headers = init?.headers as Headers;
      captured.body = init?.body as string;
      // Return a CBOR-encoded null InclusionProofResponse: tag(39042) over [0x80] (empty array)
      // would be malformed, so just throw an error response — we abort on parse but capture stays.
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: -32603, message: 'stub' }, id: 'test', jsonrpc: '2.0' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );
    }) as typeof fetch;

    const client = new AggregatorClient('http://test.invalid', null);
    const rawStateBytes = new Uint8Array(32).fill(0xab);
    const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(rawStateBytes));
    await client.getInclusionProof(stateId).catch(() => undefined); // ignore parse failure

    expect(captured.body).toBeDefined();
    const parsed = JSON.parse(captured.body!) as { params: { stateId: string } };
    expect(parsed.params.stateId).toMatch(/^[0-9a-fA-F]+$/);
    expect(parsed.params.stateId).not.toContain('StateId[');
    expect(parsed.params.stateId).toEqual(HexConverter.encode(stateId.data));
  });
});
