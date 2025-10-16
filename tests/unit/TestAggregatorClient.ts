import { numberToBytesBE } from '@noble/curves/utils.js';

import { Authenticator } from '../../src/api/Authenticator.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { LeafValue } from '../../src/api/LeafValue.js';
import { RequestId } from '../../src/api/RequestId.js';
import { SubmitCommitmentResponse, SubmitCommitmentStatus } from '../../src/api/SubmitCommitmentResponse.js';
import { InputRecord } from '../../src/bft/InputRecord.js';
import { RootTrustBase, RootTrustBaseNodeInfo } from '../../src/bft/RootTrustBase.js';
import { ShardTreeCertificate } from '../../src/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../src/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../src/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../src/bft/UnicityTreeCertificate.js';
import { DataHash } from '../../src/hash/DataHash.js';
import { DataHasher } from '../../src/hash/DataHasher.js';
import { DataHasherFactory } from '../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../src/hash/HashAlgorithm.js';
import { SparseMerkleTree } from '../../src/mtree/plain/SparseMerkleTree.js';
import { CborSerializer } from '../../src/serializer/cbor/CborSerializer.js';
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
  private readonly requests: Map<bigint, Transaction> = new Map();

  private constructor(
    private readonly smt: SparseMerkleTree,
    private readonly signingService: SigningService,
  ) {
    this.rootTrustBase = new RootTrustBase(
      0n,
      0,
      0n,
      0n,
      [new RootTrustBaseNodeInfo('NODE', signingService.publicKey, 1n)],
      1n,
      new Uint8Array(0),
      new Uint8Array(0),
      null,
      new Map(),
    );
  }

  public static async create(): Promise<TestAggregatorClient> {
    return new TestAggregatorClient(
      new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher)),
      await SigningService.createFromSecret(SigningService.generatePrivateKey()),
    );
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
          await this.generateUnicityCertificate(root.hash, this.signingService),
        ),
      ),
    );
  }

  private async generateUnicityCertificate(
    rootHash: DataHash,
    signingService: SigningService,
  ): Promise<UnicityCertificate> {
    const inputRecord = new InputRecord(0n, 0n, 0n, null, rootHash.imprint, new Uint8Array(0), 0n, null, 0n, null);
    const technicalRecordHash = null;
    const shardConfigurationHash = new Uint8Array(32);
    const shardTreeCertificate = new ShardTreeCertificate(new Uint8Array(0), []);

    const shardTreeCertificateRootHash = await UnicityCertificate.calculateShardTreeCertificateRootHash(
      inputRecord,
      technicalRecordHash,
      shardConfigurationHash,
      shardTreeCertificate,
    );

    const partitionIdentifier = 0n;

    const key = numberToBytesBE(partitionIdentifier, 4);
    const shardTreeCertificateRootCborHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(shardTreeCertificateRootHash.data))
      .digest();

    const unicitySealHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(new Uint8Array([0x01])))
      .update(CborSerializer.encodeByteString(key))
      .update(CborSerializer.encodeByteString(shardTreeCertificateRootCborHash.data))
      .digest();

    let seal = new UnicitySeal(0n, 0n, 0n, 0n, 0n, null, unicitySealHash.data, null);

    const signature = await signingService.sign(
      await new DataHasher(HashAlgorithm.SHA256).update(seal.toCBOR()).digest(),
    );
    seal = new UnicitySeal(
      seal.version,
      seal.networkId,
      seal.rootChainRoundNumber,
      seal.epoch,
      seal.timestamp,
      seal.previousHash,
      seal.hash,
      new Map([['NODE', signature.encode()]]),
    );

    return new UnicityCertificate(
      0n,
      inputRecord,
      technicalRecordHash,
      shardConfigurationHash,
      shardTreeCertificate,
      new UnicityTreeCertificate(0n, partitionIdentifier, []),
      seal,
    );
  }
}
