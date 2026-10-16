import { UnicitySealHashMatchesWithRootHashRule } from '../../../src/api/bft/verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { VerificationContext } from '../../../src/transaction/verification/VerificationContext.js';
import { IWorker } from '../../../src/transaction/verification/worker/IWorker.js';
import { NodeTransferTransactionVerifierWorker } from '../../../src/transaction/verification/worker/NodeTransferTransactionVerifierWorker.js';
import {
  ITransferTransactionVerificationRequest,
  TransferTransactionVerificationResponse,
  WorkerTokenVerifier,
} from '../../../src/transaction/verification/worker/WorkerTokenVerifier.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(180_000);

/** The worker body: a default verifier, so the worker batch is one operation. */
class CountingWorkerBody extends NodeTransferTransactionVerifierWorker {
  private readonly verifier = PredicateVerifierService.create();

  public constructor(private readonly certificateVerifier: UnicityCertificateVerifier) {
    super();
  }

  protected get predicateVerifier(): PredicateVerifierService {
    return this.verifier;
  }

  protected get unicityCertificateVerifier(): UnicityCertificateVerifier {
    return this.certificateVerifier;
  }
}

class InlineWorker implements IWorker {
  public onerror: ((event: { message: string }) => void) | null = null;
  public onmessage: ((event: { data: TransferTransactionVerificationResponse }) => void) | null = null;

  public constructor(
    private readonly body: CountingWorkerBody,
    private readonly onRequest: () => void,
  ) {}

  public postMessage(request: ITransferTransactionVerificationRequest): void {
    this.onRequest();
    void this.body.verify(request).then((response) => this.onmessage?.({ data: response }));
  }

  public terminate(): void {
    // nothing to release
  }
}

class InlineWorkerTokenVerifier extends WorkerTokenVerifier {
  public requests = 0;

  public constructor(
    poolSize: number,
    private readonly body: CountingWorkerBody,
  ) {
    super(poolSize);
  }

  protected createWorker(): IWorker {
    return new InlineWorker(this.body, () => this.requests++);
  }
}

describe('worker token verification work', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is bounded by the number of batches, not by the number of transfers', async () => {
    const poolSize = 2;
    const rows: { bodies: number; quorums: number; requests: number; transfers: number }[] = [];
    for (const transfers of [2, 4, 8]) {
      const s = await scenario(0);
      const routing = new ShardRouting({
        endpoints: [{ client: s.world.client(''), shard: shardIdFromBits('') }],
        partitionId: WORLD_PARTITION,
        scheme: [],
      });
      const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(
        await s.history(transfers),
      );
      if (result.status !== 'consolidated') {
        throw new Error('expected consolidation');
      }

      const signatureVerifier = new Secp256k1SignatureVerifier();
      const quorums = jest.spyOn(signatureVerifier, 'verify');
      const bodies = jest.spyOn(UnicitySealHashMatchesWithRootHashRule, 'verify');
      const certificateVerifier = new UnicityCertificateVerifier(
        new UnicitySealQuorumSignaturesVerificationRule(signatureVerifier),
      );
      const verifier = new InlineWorkerTokenVerifier(poolSize, new CountingWorkerBody(certificateVerifier));
      // the main thread checks the genesis with its own (here the same) verifier
      const context = new VerificationContext(
        s.context.trustBase,
        s.context.predicateVerifier,
        certificateVerifier,
        s.context.mintJustificationVerifier,
        s.context.tokenIssuanceVerifier,
      );
      expect((await verifier.verify(result.token, context)).status).toEqual(VerificationStatus.OK);
      rows.push({
        bodies: bodies.mock.calls.length,
        quorums: quorums.mock.calls.length,
        requests: verifier.requests,
        transfers,
      });
      verifier.dispose();
      bodies.mockRestore();
    }

    for (const row of rows) {
      // one operation for the genesis on the main thread plus one per worker request: one body and one quorum each,
      // where it used to be one of each per transfer
      expect(row.requests).toBeLessThanOrEqual(poolSize);
      expect(row.bodies).toBeLessThanOrEqual(row.requests + 1);
      expect(row.quorums).toBeLessThanOrEqual(row.requests + 1);
    }
    // the count does not grow with the history
    expect(new Set(rows.map((r) => r.bodies)).size).toEqual(1);
    expect(new Set(rows.map((r) => r.quorums)).size).toEqual(1);
  });
});
