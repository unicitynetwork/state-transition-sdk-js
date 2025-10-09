import { Authenticator } from '../../src/api/Authenticator.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { LeafValue } from '../../src/api/LeafValue.js';
import { RequestId } from '../../src/api/RequestId.js';
import { SubmitCommitmentResponse, SubmitCommitmentStatus } from '../../src/api/SubmitCommitmentResponse.js';
import { DataHash } from '../../src/hash/DataHash.js';
import { SparseMerkleTree } from '../../src/mtree/plain/SparseMerkleTree.js';
import { InclusionProof } from '../../src/transaction/InclusionProof.js';

class Transaction {
  public constructor(
    public readonly authenticator: Authenticator,
    public readonly transactionHash: DataHash,
  ) {}
}

export class TestAggregatorClient implements IAggregatorClient {
  private readonly requests: Map<bigint, Transaction> = new Map();

  public constructor(private readonly smt: SparseMerkleTree) {}

  public async submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
  ): Promise<SubmitCommitmentResponse> {
    const path = requestId.toBitString().toBigInt();
    const transaction = new Transaction(authenticator, transactionHash);
    const leafValue = await LeafValue.create(authenticator, transactionHash);
    this.smt.addLeaf(path, leafValue.bytes);
    this.requests.set(path, transaction);

    return new SubmitCommitmentResponse(SubmitCommitmentStatus.SUCCESS);
  }

  public async getInclusionProof(requestId: RequestId): Promise<InclusionProof> {
    const transaction = this.requests.get(requestId.toBitString().toBigInt());
    const root = await this.smt.calculateRoot();
    return Promise.resolve(
      new InclusionProof(
        root.getPath(requestId.toBitString().toBigInt()),
        transaction?.authenticator ?? null,
        transaction?.transactionHash ?? null,
      ),
    );
  }
}
