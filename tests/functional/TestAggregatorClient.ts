import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { StateId } from '../../src/api/StateId.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { EncodedPredicate } from '../../src/predicate/EncodedPredicate.js';
import { PredicateVerifier } from '../../src/predicate/verification/PredicateVerifier.js';
import { SparseMerkleTree } from '../../src/smt/plain/SparseMerkleTree.js';
import { createRootTrustBase } from '../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../utils/UnicityCertificateFixture.js';

/**
 * Test aggregator client implementation that stores all submitted certification requests in memory.
 */
export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
  private readonly predicateVerifier = PredicateVerifier.create();
  private readonly requests: Map<bigint, CertificationData> = new Map();

  private constructor(
    private readonly smt: SparseMerkleTree,
    private readonly signingService: SigningService,
  ) {
    this.rootTrustBase = createRootTrustBase(this.signingService.publicKey);
  }

  /**
   * Creates a new TestAggregatorClient instance with optional private key.
   * If no private key is provided, a new one is generated.
   */
  public static create(privateKey: Uint8Array = SigningService.generatePrivateKey()): TestAggregatorClient {
    return new TestAggregatorClient(
      new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)),
      new SigningService(privateKey),
    );
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    const certificationData = this.requests.get(stateId.toBitString().toBigInt());
    const root = await this.smt.calculateRoot();
    return Promise.resolve(
      new InclusionProofResponse(
        1n,
        new InclusionProof(
          root.getPath(stateId.toBitString().toBigInt()),
          certificationData ?? null,
          await createUnicityCertificate(root.hash, this.signingService),
        ),
      ),
    );
  }

  /**
   * @inheritDoc
   */
  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    const stateId = await StateId.fromCertificationData(certificationData);

    const result = await this.predicateVerifier.verify(
      EncodedPredicate.fromCBOR(certificationData.lockScript.toCBOR()),
      certificationData,
    );

    if (!result) {
      return CertificationResponse.create(CertificationStatus.SIGNATURE_VERIFICATION_FAILED);
    }

    const path = stateId.toBitString().toBigInt();
    if (!this.requests.has(path)) {
      const leafValue = await certificationData.calculateLeafValue();
      await this.smt.addLeaf(path, leafValue.imprint);
      this.requests.set(path, certificationData);
    }

    return CertificationResponse.create(CertificationStatus.SUCCESS);
  }
}
