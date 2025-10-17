import { createRootTrustBase } from './utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from './utils/UnicityCertificateFixture.js';
import { Authenticator } from '../../src/api/Authenticator.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { LeafValue } from '../../src/api/LeafValue.js';
import { RequestId } from '../../src/api/RequestId.js';
import { SubmitCommitmentResponse, SubmitCommitmentStatus } from '../../src/api/SubmitCommitmentResponse.js';
import { RootTrustBase } from '../../src/bft/RootTrustBase.js';
import { DataHash } from '../../src/hash/DataHash.js';
import { DataHasher } from '../../src/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/hash/HashAlgorithm.js';
import { SparseMerkleTree } from '../../src/mtree/plain/SparseMerkleTree.js';
import { SigningService } from '../../src/sign/SigningService.js';
import { InclusionProof } from '../../src/transaction/InclusionProof.js';

class Transaction {
  public constructor(
    public readonly authenticator: Authenticator,
    public readonly transactionHash: DataHash,
  ) {}
}

export class TestAggregatorClient implements IAggregatorClient {
  public readonly rootTrustBase: RootTrustBase;
  private readonly signingService = new SigningService(SigningService.generatePrivateKey());
  private readonly requests: Map<bigint, Transaction> = new Map();

  private constructor(private readonly smt: SparseMerkleTree) {
    this.rootTrustBase = createRootTrustBase(this.signingService.publicKey);
  }

  public static create(): TestAggregatorClient {
    return new TestAggregatorClient(new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)));
  }

  public async submitCommitment(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
  ): Promise<SubmitCommitmentResponse> {
    const path = requestId.toBitString().toBigInt();
    const transaction = new Transaction(authenticator, transactionHash);
    const leafValue = await LeafValue.create(authenticator, transactionHash);
    await this.smt.addLeaf(path, leafValue.bytes);
    this.requests.set(path, transaction);

    return new SubmitCommitmentResponse(SubmitCommitmentStatus.SUCCESS);
  }

  public async getInclusionProof(requestId: RequestId): Promise<InclusionProofResponse> {
    const transaction = this.requests.get(requestId.toBitString().toBigInt());
    const root = await this.smt.calculateRoot();
    return Promise.resolve(
      new InclusionProofResponse(
        new InclusionProof(
          root.getPath(requestId.toBitString().toBigInt()),
          transaction?.authenticator ?? null,
          transaction?.transactionHash ?? null,
          await createUnicityCertificate(root.hash, this.signingService),
        ),
      ),
    );
  }
}
