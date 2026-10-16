import { PartitionViewAuthenticator } from '../../../src/api/bft/AuthenticatedPartitionView.js';
import { PartitionView } from '../../../src/api/bft/PartitionView.js';
import { ShardTreeCertificate } from '../../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { InclusionProofBatch } from '../../../src/api/IBatchAggregatorClient.js';
import { InclusionProof } from '../../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import { ConsolidationError } from '../../../src/consolidation/ConsolidationError.js';
import { ConsolidationResult } from '../../../src/consolidation/ConsolidationResult.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { IScenario, scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(120_000);

function clientOf(
  s: IScenario,
  pins?: { hash: Uint8Array; shard: ReturnType<typeof shardIdFromBits> }[],
): TokenProofClient {
  return new TokenProofClient({
    routing: new ShardRouting({
      endpoints: s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardIdFromBits(b) })),
      partitionId: WORLD_PARTITION,
      scheme: s.world.scheme,
      shardConfigurationPins: pins,
    }),
    verificationContext: s.context,
  });
}

function mutate(
  batch: InclusionProofBatch,
  change: (r: InclusionProofResponse, i: number) => InclusionProofResponse,
): InclusionProofBatch {
  return new InclusionProofBatch(batch.proofs.map(change), batch.partitionViewBytes);
}

function withUc(r: InclusionProofResponse, uc: UnicityCertificate): InclusionProofResponse {
  const p = r.inclusionProof as InclusionProof;
  return InclusionProofResponse.certified(
    r.blockNumber,
    new InclusionProof(p.certificationData, p.referenceTime, p.inclusionCertificate, uc),
  );
}

async function expectIntegrity(promise: Promise<ConsolidationResult>, outcomes: string[]): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConsolidationError);
  expect((error as ConsolidationError).kind).toEqual('integrity');
  expect(outcomes).toContain((error as ConsolidationError).outcome);
}

describe('Unsharded direct target', () => {
  it('consolidates a latest batch without partition view: one request, no view work, no exact-root request', async () => {
    const s = await scenario(0);
    const token = await s.history(3);
    s.world.faults.set('', { withholdView: true });
    s.world.requests.length = 0;
    const fromCBOR = jest.spyOn(PartitionView, 'fromCBOR');
    const authenticate = jest.spyOn(PartitionViewAuthenticator.prototype, 'authenticate');

    const result = await clientOf(s).consolidate(token);

    expect(result.status).toEqual('consolidated');
    if (result.status !== 'consolidated') {
      return;
    }
    expect(result.summary).toMatchObject({ alreadyConsolidated: false, consolidatedSeals: 1, requests: 1, shards: 1 });
    expect(s.world.requests.filter((r) => r.method === 'getInclusionProofs')).toEqual([
      { exactRoot: null, method: 'getInclusionProofs', shard: '' },
    ]);
    expect(fromCBOR).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
    expect((await result.token.verify(s.context)).status).toEqual('OK');
    fromCBOR.mockRestore();
    authenticate.mockRestore();
  });

  it('still validates a legacy sidecar when an unsharded server sends one, and rejects a malformed one', async () => {
    const s = await scenario(0);
    const token = await s.history(3);
    expect((await clientOf(s).consolidate(token)).status).toEqual('consolidated');

    s.world.faults.set('', {
      tamper: (batch) => {
        const view = new Uint8Array(batch.partitionViewBytes as Uint8Array);
        view[view.length - 5] ^= 1;
        return new InclusionProofBatch(batch.proofs, view);
      },
    });
    await expectIntegrity(clientOf(s).consolidate(token), ['invalid_input', 'binding_mismatch']);
  });

  it('does not downgrade a sharded partition: a withheld view is unavailable, never a direct target', async () => {
    const s = await scenario(1);
    const token = await s.history(3);
    for (const bits of s.world.bits) {
      s.world.faults.set(bits, { withholdView: true });
    }
    const result = await clientOf(s).consolidate(token);
    expect(result).toMatchObject({ reason: 'partition_view_unavailable', status: 'unavailable' });
  });

  describe('rejects, never falls back', () => {
    const arrange = (s: IScenario, tamper: (b: InclusionProofBatch) => InclusionProofBatch): void =>
      void s.world.faults.set('', { tamper, withholdView: true });

    it('an altered seal signature', async () => {
      const s = await scenario(0);
      const token = await s.history(3);
      arrange(s, (batch) =>
        mutate(batch, (r) => {
          const uc = (r.inclusionProof as InclusionProof).unicityCertificate;
          const seal = uc.unicitySeal.toCBOR();
          seal[seal.length - 3] ^= 1;
          return withUc(
            r,
            new UnicityCertificate(
              uc.inputRecord,
              uc.technicalRecordHash,
              uc.shardConfigurationHash,
              uc.shardTreeCertificate,
              uc.unicityTreeCertificate,
              (uc.unicitySeal.constructor as typeof import('../../../src/api/bft/UnicitySeal.js').UnicitySeal).fromCBOR(
                seal,
              ),
            ),
          );
        }),
      );
      await expectIntegrity(clientOf(s).consolidate(token), ['unauthenticated']);
    });

    it('an empty shard with a nonempty shard path', async () => {
      const s = await scenario(0);
      const token = await s.history(3);
      arrange(s, (batch) =>
        mutate(batch, (r) => {
          const uc = (r.inclusionProof as InclusionProof).unicityCertificate;
          return withUc(
            r,
            new UnicityCertificate(
              uc.inputRecord,
              uc.technicalRecordHash,
              uc.shardConfigurationHash,
              new ShardTreeCertificate(uc.shardTreeCertificate.shard, [new Uint8Array(32)]),
              uc.unicityTreeCertificate,
              uc.unicitySeal,
            ),
          );
        }),
      );
      await expectIntegrity(clientOf(s).consolidate(token), ['incompatible_lineage', 'binding_mismatch']);
    });

    it('a mixed set of certificates', async () => {
      const s = await scenario(0);
      const token = await s.history(3);
      const older = s.world.retained()[1].ucs.get('');
      arrange(s, (batch) => mutate(batch, (r, i) => (i === 1 && older ? withUc(r, older) : r)));
      await expectIntegrity(clientOf(s).consolidate(token), ['invalid_input']);
    });

    it('a certificate that contradicts the pinned configuration', async () => {
      const s = await scenario(0);
      const token = await s.history(3);
      s.world.faults.set('', { withholdView: true });
      await expectIntegrity(
        clientOf(s, [{ hash: new Uint8Array(32).fill(9), shard: shardIdFromBits('') }]).consolidate(token),
        ['incompatible_lineage'],
      );
    });
  });

  describe('a served certificate that contradicts the routing, without view (parity with Go and Rust)', () => {
    const reshard = (
      batch: InclusionProofBatch,
      shard: ReturnType<typeof shardIdFromBits>,
      siblings: number,
    ): InclusionProofBatch =>
      mutate(batch, (r) => {
        const uc = (r.inclusionProof as InclusionProof).unicityCertificate;
        return withUc(
          r,
          new UnicityCertificate(
            uc.inputRecord,
            uc.technicalRecordHash,
            uc.shardConfigurationHash,
            new ShardTreeCertificate(
              shard,
              Array.from({ length: siblings }, () => new Uint8Array(32)),
            ),
            uc.unicityTreeCertificate,
            uc.unicitySeal,
          ),
        );
      });

    it('sharded routing, empty-shard certificate: integrity, not a retryable missing view', async () => {
      const s = await scenario(1);
      const token = await s.history(3);
      for (const bits of s.world.bits) {
        s.world.faults.set(bits, { tamper: (b) => reshard(b, shardIdFromBits(''), 0), withholdView: true });
      }
      await expectIntegrity(clientOf(s).consolidate(token), ['binding_mismatch']);
    });

    it('unsharded routing, sharded certificate: the view is unavailable, as in the reference clients', async () => {
      const s = await scenario(0);
      const token = await s.history(3);
      s.world.faults.set('', { tamper: (b) => reshard(b, shardIdFromBits('1'), 1), withholdView: true });
      expect(await clientOf(s).consolidate(token)).toMatchObject({
        reason: 'partition_view_unavailable',
        retryable: true,
        status: 'unavailable',
      });
    });
  });
});
