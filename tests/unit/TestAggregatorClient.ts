import { createRootTrustBase } from './utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from './utils/UnicityCertificateFixture.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { StateId } from '../../src/api/StateId.js';
import { RootTrustBase } from '../../src/bft/RootTrustBase.js';
import { DataHasher } from '../../src/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/hash/HashAlgorithm.js';
import { SparseMerkleTree } from '../../src/mtree/plain/SparseMerkleTree.js';
import { SigningService } from '../../src/sign/SigningService.js';
import { InclusionProof } from '../../src/transaction/InclusionProof.js';

export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
  private readonly signingService = new SigningService(SigningService.generatePrivateKey());
  private readonly requests: Map<bigint, CertificationData> = new Map();

  private constructor(private readonly smt: SparseMerkleTree) {
    this.rootTrustBase = createRootTrustBase(this.signingService.publicKey);
  }

  public static create(): TestAggregatorClient {
    return new TestAggregatorClient(new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)));
  }

  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    const stateId = await certificationData.calculateStateId();
    const path = stateId.toBitString().toBigInt();
    const leafValue = await certificationData.calculateLeafValue();
    await this.smt.addLeaf(path, leafValue.imprint);
    this.requests.set(path, certificationData);

    return CertificationResponse.create(CertificationStatus.SUCCESS);
  }

  public async getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    const certificationData = this.requests.get(stateId.toBitString().toBigInt());
    const root = await this.smt.calculateRoot();
    return Promise.resolve(
      new InclusionProofResponse(
        new InclusionProof(
          root.getPath(stateId.toBitString().toBigInt()),
          certificationData ?? null,
          await createUnicityCertificate(root.hash, this.signingService),
        ),
      ),
    );
  }
}
