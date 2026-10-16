import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { UnicityCertificateInterner } from '../../../src/api/bft/UnicityCertificateInterner.js';
import { InclusionProof } from '../../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import { StateId } from '../../../src/api/StateId.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { unicityCertificateMetrics } from '../../../src/internal/bft/UnicityCertificateMetrics.js';
import { Token } from '../../../src/transaction/Token.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { NestedTokenJustification, scenario, IScenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(180_000);

function decodesDuring<T>(work: () => T): { decodes: number; result: T } {
  const before = unicityCertificateMetrics.decodes;
  const result = work();
  return { decodes: unicityCertificateMetrics.decodes - before, result };
}

/** The parses made while an asynchronous operation runs to completion. */
async function decodesAwaiting<T>(work: () => Promise<T>): Promise<{ decodes: number; result: T }> {
  const before = unicityCertificateMetrics.decodes;
  const result = await work();
  return { decodes: unicityCertificateMetrics.decodes - before, result };
}

function proofsOf(token: Token): InclusionProof[] {
  return [token.genesis, ...token.transactions].map((t) => t.inclusionProof);
}

function distinctCertificates(token: Token): number {
  return new Set(proofsOf(token).map((p) => HexConverter.encode(p.unicityCertificate.toCBOR()))).size;
}

async function consolidated(s: IScenario, token: Token): Promise<Token> {
  const routing = new ShardRouting({
    endpoints: s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardIdFromBits(b) })),
    partitionId: WORLD_PARTITION,
    scheme: s.world.scheme,
  });
  const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(token);
  if (result.status !== 'consolidated') {
    throw new Error('expected consolidation');
  }
  return result.token;
}

describe('wire certificate decoding', () => {
  afterEach(() => jest.restoreAllMocks());

  it('parses one certificate per distinct complete bytes when a token is decoded, not one per proof', async () => {
    for (const transfers of [1, 2, 4, 8]) {
      const s = await scenario(0);
      const token = await consolidated(s, await s.history(transfers));
      const bytes = token.toCBOR();
      const proofs = transfers + 1;
      expect(distinctCertificates(token)).toEqual(1);

      // slow reference model: every proof parsed on its own
      const reference = decodesDuring(() => proofsOf(token).map((p) => InclusionProof.fromCBOR(p.toCBOR())));
      expect(reference.decodes).toEqual(proofs);

      const decoded = await decodesAwaiting(() => Token.fromCBOR(bytes));
      const interned = decoded.result;
      expect(decoded.decodes).toEqual(1);
      expect(interned.toCBOR()).toEqual(bytes);
      expect((await interned.verify(s.context)).status).toEqual(VerificationStatus.OK);
    }
  });

  it('parses the distinct certificates of a sharded or unconsolidated token, nothing more', async () => {
    const s = await scenario(2);
    const plain = await s.history(9);
    const sharded = await consolidated(s, plain);
    for (const token of [plain, sharded]) {
      const decoded = await decodesAwaiting(() => Token.fromCBOR(token.toCBOR()));
      expect(decoded.decodes).toEqual(distinctCertificates(token));
    }
    expect(distinctCertificates(sharded)).toBeLessThanOrEqual(4);
  });

  it('takes no decode during verification, and one decode per distinct certificate for a nested token', async () => {
    const s = await scenario(0);
    const nested = await consolidated(s, await s.history(4));
    const outer = await consolidated(s, await s.history(3, new NestedTokenJustification(nested)));
    const decoded = await Token.fromCBOR(outer.toCBOR());

    const before = unicityCertificateMetrics.decodes;
    expect((await decoded.verify(s.context)).status).toEqual(VerificationStatus.OK);
    // the only parses in verification are the nested token's, once per distinct certificate of that token
    expect(unicityCertificateMetrics.decodes - before).toEqual(distinctCertificates(nested));
  });

  it('parses one certificate for a batch response whose proofs share it', async () => {
    for (const proofs of [1, 4, 16]) {
      const s = await scenario(0);
      const token = await s.history(proofs - 1);
      const world = s.world;
      const ids = await Promise.all(
        [token.genesis, ...token.transactions].map((t) =>
          StateId.fromCertificationData(t.inclusionProof.certificationData),
        ),
      );
      const batch = await world.client('').getInclusionProofs(ids);
      const wire = batch.proofs.map((p) => HexConverter.encode(p.toCBOR()));
      jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
        const id = (JSON.parse(init?.body as string) as { id: string }).id;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id,
              jsonrpc: '2.0',
              result: {
                partitionView: HexConverter.encode(batch.partitionViewBytes ?? new Uint8Array()),
                proofs: wire,
              },
            }),
          ),
        );
      });
      const decoded = await decodesDuring(() => new AggregatorClient('https://example.com').getInclusionProofs(ids))
        .result;
      expect(decoded.proofs).toHaveLength(proofs);
      jest.restoreAllMocks();
    }
  });

  it('counts a batch decode as one parse however many proofs it carries', async () => {
    const s = await scenario(0);
    const token = await s.history(7);
    const ids = await Promise.all(
      [token.genesis, ...token.transactions].map((t) =>
        StateId.fromCertificationData(t.inclusionProof.certificationData),
      ),
    );
    const batch = await s.world.client('').getInclusionProofs(ids);
    const wire = batch.proofs.map((p) => HexConverter.encode(p.toCBOR()));
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: (JSON.parse(init?.body as string) as { id: string }).id,
            jsonrpc: '2.0',
            result: { proofs: wire },
          }),
        ),
      ),
    );
    const before = unicityCertificateMetrics.decodes;
    const decoded = await new AggregatorClient('https://example.com').getInclusionProofs(ids);
    expect(decoded.proofs).toHaveLength(8);
    expect(unicityCertificateMetrics.decodes - before).toEqual(1);
  });
});

describe('public decoders keep their signatures', () => {
  it('can be passed point-free to map, whose second argument is the index', async () => {
    const s = await scenario(0);
    const tokens = await Promise.all([s.history(1), s.history(2), s.history(1), s.history(3)]);
    const bytes = tokens.map((t) => t.toCBOR());

    const decoded = await Promise.all(bytes.map(Token.fromCBOR));
    expect(decoded.map((t) => HexConverter.encode(t.toCBOR()))).toEqual(bytes.map((b) => HexConverter.encode(b)));

    const proofs = tokens.flatMap(proofsOf).map((p) => p.toCBOR());
    expect(proofs.length).toBeGreaterThan(3);
    expect(proofs.map(InclusionProof.fromCBOR)).toHaveLength(proofs.length);
    const responses = tokens.flatMap(proofsOf).map((p) => InclusionProofResponse.certified(1n, p).toCBOR());
    expect(responses.map(InclusionProofResponse.fromCBOR)).toHaveLength(responses.length);
    expect(
      tokens
        .flatMap(proofsOf)
        .map((p) => p.unicityCertificate.toCBOR())
        .map(UnicityCertificate.fromCBOR),
    ).toHaveLength(proofs.length);

    expect(Token.fromCBOR.length).toEqual(1);
    expect(InclusionProof.fromCBOR.length).toEqual(1);
    expect(InclusionProofResponse.fromCBOR.length).toEqual(1);
    expect(UnicityCertificate.fromCBOR.length).toEqual(1);
  });

  it('does not share certificate instances between two separate decodes', async () => {
    const s = await scenario(0);
    const bytes = (await consolidated(s, await s.history(3))).toCBOR();
    const first = await Token.fromCBOR(bytes);
    const second = await Token.fromCBOR(bytes);
    // within one decode the proofs share it, across decodes nothing is shared
    expect(first.genesis.inclusionProof.unicityCertificate).toBe(
      first.transactions[0].inclusionProof.unicityCertificate,
    );
    expect(first.genesis.inclusionProof.unicityCertificate).not.toBe(second.genesis.inclusionProof.unicityCertificate);
    expect(first.transactions[0].inclusionProof.unicityCertificate).not.toBe(
      second.transactions[0].inclusionProof.unicityCertificate,
    );
  });
});

describe('UnicityCertificateInterner', () => {
  const sample = async (): Promise<Uint8Array[]> => {
    const s = await scenario(1);
    const token = await s.history(4);
    return proofsOf(token).map((p) => p.unicityCertificate.toCBOR());
  };

  it('matches complete bytes only and never remembers a failure', async () => {
    const certificates = await sample();
    const interner = new UnicityCertificateInterner((b) => UnicityCertificate.fromCBOR(b));
    const first = interner.decode(certificates[0]);
    expect(interner.decode(new Uint8Array(certificates[0]))).toBe(first);
    expect(interner.stats).toEqual({ hits: 1, parses: 1 });

    // a certificate that differs in a signature byte is another certificate
    const altered = new Uint8Array(certificates[0]);
    altered[altered.length - 3] ^= 1;
    expect(() => interner.decode(altered)).not.toThrow();
    expect(interner.stats.parses).toEqual(2);
    expect(interner.decode(altered).toCBOR()).toEqual(altered);

    const garbage = new Uint8Array([0xf6]);
    expect(() => interner.decode(garbage)).toThrow();
    expect(() => interner.decode(garbage)).toThrow();
    expect(interner.stats.parses).toEqual(2);
  });

  it('is bounded and drops the oldest', async () => {
    const certificates = await sample();
    const distinct = [...new Map(certificates.map((c) => [HexConverter.encode(c), c])).values()];
    expect(distinct.length).toBeGreaterThanOrEqual(3);
    const interner = new UnicityCertificateInterner((b) => UnicityCertificate.fromCBOR(b), 2);
    for (const c of distinct.slice(0, 3)) {
      interner.decode(c);
    }
    interner.decode(distinct[2]);
    interner.decode(distinct[1]);
    expect(interner.stats).toEqual({ hits: 2, parses: 3 });
    interner.decode(distinct[0]);
    expect(interner.stats.parses).toEqual(4);
    expect(() => new UnicityCertificateInterner((b) => UnicityCertificate.fromCBOR(b), 0)).toThrow();
  });
});
