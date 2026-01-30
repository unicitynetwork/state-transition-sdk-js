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
import { BuiltInPredicateVerifierFactory } from '../../src/predicate/builtin/BuiltInPredicateVerifierFactory.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PayToPublicKeyPredicateVerifier } from '../../src/predicate/builtin/verification/PayToPublicKeyPredicateVerifier.js';
import { EncodedPredicate } from '../../src/predicate/EncodedPredicate.js';
import { PredicateEngine } from '../../src/predicate/PredicateEngine.js';
import { PredicateVerifier } from '../../src/predicate/verification/PredicateVerifier.js';
import { SparseMerkleTree } from '../../src/smt/plain/SparseMerkleTree.js';
import { createRootTrustBase } from '../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../utils/UnicityCertificateFixture.js';

export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
  private readonly predicateVerifier = new PredicateVerifier(
    new Map([
      [
        PredicateEngine.BUILT_IN,
        new BuiltInPredicateVerifierFactory(
          new Map([[PayToPublicKeyPredicate.TYPE, new PayToPublicKeyPredicateVerifier()]]),
        ),
      ],
    ]),
  );
  private readonly requests: Map<bigint, CertificationData> = new Map();
  private readonly signingService = new SigningService(SigningService.generatePrivateKey());

  private constructor(private readonly smt: SparseMerkleTree) {
    this.rootTrustBase = createRootTrustBase(this.signingService.publicKey);
  }

  public static create(): TestAggregatorClient {
    return new TestAggregatorClient(new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)));
  }

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
