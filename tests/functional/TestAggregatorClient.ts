import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationResponse, CertificationStatus } from '../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionCertificate } from '../../src/api/InclusionCertificate.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { StateId } from '../../src/api/StateId.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { SparseMerkleTree } from '../../src/smt/radix/SparseMerkleTree.js';
import { BitString } from '../../src/util/BitString.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { createRootTrustBase } from '../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../utils/UnicityCertificateFixture.js';

/**
 * Test aggregator client implementation that stores all submitted certification requests in memory.
 */
export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
  private readonly predicateVerifier: PredicateVerifierService;
  private readonly requests: Map<bigint, CertificationData> = new Map();

  private constructor(
    private readonly smt: SparseMerkleTree,
    private readonly signingService: SigningService,
  ) {
    this.rootTrustBase = createRootTrustBase(this.signingService.publicKey);
    this.predicateVerifier = PredicateVerifierService.create(this.rootTrustBase);
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
    const path = BitString.fromBytesReversedLSB(stateId.data).toBigInt();
    const root = await this.smt.calculateRoot();

    if (!this.requests.has(path)) {
      return Promise.resolve(
        new InclusionProofResponse(
          1n,
          new InclusionProof(null, null, await createUnicityCertificate(root.hash, this.signingService)),
        ),
      );
    }

    const certificationData = this.requests.get(path);

    return Promise.resolve(
      new InclusionProofResponse(
        1n,
        new InclusionProof(
          certificationData ?? null,
          InclusionCertificate.create(root, stateId.data),
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
      certificationData.lockScript,
      certificationData.sourceStateHash,
      certificationData.transactionHash,
      certificationData.unlockScript,
    );

    if (result.status !== VerificationStatus.OK) {
      return CertificationResponse.create(CertificationStatus.SIGNATURE_VERIFICATION_FAILED);
    }

    const path = BitString.fromBytesReversedLSB(stateId.data).toBigInt();
    if (!this.requests.has(path)) {
      const leafValue = certificationData.transactionHash;
      await this.smt.addLeaf(stateId.data, leafValue.data);
      this.requests.set(path, certificationData);
    }

    return CertificationResponse.create(CertificationStatus.SUCCESS);
  }
}
