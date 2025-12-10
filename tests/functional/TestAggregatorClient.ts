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
import { Signature } from '../../src/crypto/secp256k1/Signature.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { SparseMerkleTree } from '../../src/smt/plain/SparseMerkleTree.js';
import { createRootTrustBase } from '../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../utils/UnicityCertificateFixture.js';

export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
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
    // TODO: Currently it is working with old version of aggregator, so lockScript is just public key
    const result = await SigningService.verifyWithPublicKey(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            certificationData.sourceStateHash.toCBOR(),
            certificationData.transactionHash.toCBOR(),
          ),
        )
        .digest(),
      Signature.decode(certificationData.unlockScript).bytes,
      certificationData.lockScript.encode(),
    );

    if (!result) {
      return CertificationResponse.create(CertificationStatus.SIGNATURE_VERIFICATION_FAILED);
    }

    const path = stateId.toBitString().toBigInt();
    const leafValue = await certificationData.calculateLeafValue();
    await this.smt.addLeaf(path, leafValue.imprint);
    this.requests.set(path, certificationData);

    return CertificationResponse.create(CertificationStatus.SUCCESS);
  }
}
