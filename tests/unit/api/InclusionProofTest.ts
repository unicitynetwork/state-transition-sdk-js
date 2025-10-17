import { Authenticator } from '../../../src/api/Authenticator.js';
import { LeafValue } from '../../../src/api/LeafValue.js';
import { RequestId } from '../../../src/api/RequestId.js';
import { RootTrustBase } from '../../../src/bft/RootTrustBase.js';
import { UnicityCertificate } from '../../../src/bft/UnicityCertificate.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { DataHasherFactory } from '../../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/hash/NodeDataHasher.js';
import { SparseMerkleTree } from '../../../src/mtree/plain/SparseMerkleTree.js';
import { SparseMerkleTreePath } from '../../../src/mtree/plain/SparseMerkleTreePath.js';
import { CborSerializer } from '../../../src/serializer/cbor/CborSerializer.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { InclusionProof, InclusionProofVerificationStatus } from '../../../src/transaction/InclusionProof.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { createRootTrustBase } from '../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../utils/UnicityCertificateFixture.js';

describe('InclusionProof', () => {
  const signingService = new SigningService(
    new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
  );
  const publicKey = signingService.publicKey;
  const transactionHash = DataHash.fromImprint(new Uint8Array(34));
  let authenticator: Authenticator;
  let merkleTreePath: SparseMerkleTreePath;
  let unicityCertificate: UnicityCertificate;
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    authenticator = await Authenticator.create(
      signingService,
      transactionHash,
      DataHash.fromImprint(new Uint8Array(34)),
    );
    const lf = await LeafValue.create(authenticator, transactionHash);
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const reqID = (await RequestId.create(publicKey, authenticator.stateHash)).toBitString().toBigInt();
    smt.addLeaf(reqID, lf.bytes);

    const root = await smt.calculateRoot();

    merkleTreePath = root.getPath(reqID);

    unicityCertificate = await createUnicityCertificate(root.hash, signingService);
    trustBase = await createRootTrustBase(signingService.publicKey);
  });

  it('should encode and decode json', () => {
    const inclusionProof = new InclusionProof(merkleTreePath, authenticator, transactionHash, unicityCertificate);
    expect(inclusionProof.toJSON()).toEqual({
      authenticator: authenticator.toJSON(),
      merkleTreePath: merkleTreePath.toJSON(),
      transactionHash: transactionHash.toJSON(),
      unicityCertificate: unicityCertificate.toJSON(),
    });

    expect(InclusionProof.fromJSON(inclusionProof.toJSON())).toStrictEqual(inclusionProof);
    expect(
      InclusionProof.fromJSON({
        authenticator: null,
        merkleTreePath: merkleTreePath.toJSON(),
        transactionHash: null,
        unicityCertificate: unicityCertificate.toJSON(),
      }),
    ).toStrictEqual(new InclusionProof(merkleTreePath, null, null, unicityCertificate));
    expect(() =>
      InclusionProof.fromJSON({
        authenticator: authenticator.toJSON(),
        merkleTreePath: merkleTreePath.toJSON(),
        transactionHash: null,
        unicityCertificate: unicityCertificate.toJSON(),
      }),
    ).toThrow('Authenticator and transaction hash must be both set or both null.');
    expect(() =>
      InclusionProof.fromJSON({
        authenticator: null,
        merkleTreePath: merkleTreePath.toJSON(),
        transactionHash: transactionHash.toJSON(),
        unicityCertificate: unicityCertificate.toJSON(),
      }),
    ).toThrow('Authenticator and transaction hash must be both set or both null.');
  });

  it('should encode and decode cbor', () => {
    const inclusionProof = new InclusionProof(merkleTreePath, authenticator, transactionHash, unicityCertificate);

    expect(inclusionProof.toCBOR()).toStrictEqual(
      CborSerializer.encodeArray(
        merkleTreePath.toCBOR(),
        authenticator.toCBOR(),
        transactionHash.toCBOR(),
        unicityCertificate.toCBOR(),
      ),
    );
    expect(InclusionProof.fromCBOR(inclusionProof.toCBOR())).toStrictEqual(inclusionProof);

    expect(
      InclusionProof.fromCBOR(
        CborSerializer.encodeArray(
          merkleTreePath.toCBOR(),
          CborSerializer.encodeNull(),
          CborSerializer.encodeNull(),
          unicityCertificate.toCBOR(),
        ),
      ),
    ).toStrictEqual(new InclusionProof(merkleTreePath, null, null, unicityCertificate));
    expect(() =>
      InclusionProof.fromCBOR(
        CborSerializer.encodeArray(
          merkleTreePath.toCBOR(),
          authenticator.toCBOR(),
          CborSerializer.encodeNull(),
          unicityCertificate.toCBOR(),
        ),
      ),
    ).toThrow('Authenticator and transaction hash must be both set or both null.');
    expect(() =>
      InclusionProof.fromCBOR(
        CborSerializer.encodeArray(
          merkleTreePath.toCBOR(),
          CborSerializer.encodeNull(),
          transactionHash.toCBOR(),
          unicityCertificate.toCBOR(),
        ),
      ),
    ).toThrow('Authenticator and transaction hash must be both set or both null.');
  });

  it('structure verification', () => {
    expect(() => new InclusionProof(merkleTreePath, authenticator, null, unicityCertificate)).toThrow(
      'Authenticator and transaction hash must be both set or both null.',
    );
    expect(() => new InclusionProof(merkleTreePath, null, transactionHash, unicityCertificate)).toThrow(
      'Authenticator and transaction hash must be both set or both null.',
    );
    expect(new InclusionProof(merkleTreePath, null, null, unicityCertificate)).toEqual({
      authenticator: null,
      merkleTreePath,
      transactionHash: null,
      unicityCertificate,
    });

    expect(new InclusionProof(merkleTreePath, authenticator, transactionHash, unicityCertificate)).toEqual({
      authenticator,
      merkleTreePath,
      transactionHash,
      unicityCertificate,
    });
  });

  it('verifies', async () => {
    const requestId = await RequestId.create(publicKey, authenticator.stateHash);
    const inclusionProof = new InclusionProof(merkleTreePath, authenticator, transactionHash, unicityCertificate);

    expect(await inclusionProof.verify(trustBase, requestId)).toEqual(InclusionProofVerificationStatus.OK);
    expect(
      await inclusionProof.verify(trustBase, await RequestId.createFromImprint(new Uint8Array(32), new Uint8Array(34))),
    ).toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);

    const invalidTransactionHashInclusionProof = new InclusionProof(
      merkleTreePath,
      authenticator,
      new DataHash(
        HashAlgorithm.SHA224,
        HexConverter.decode('FF000000000000000000000000000000000000000000000000000000000000FF'),
      ),
      unicityCertificate,
    );

    expect(await invalidTransactionHashInclusionProof.verify(trustBase, requestId)).toEqual(
      InclusionProofVerificationStatus.NOT_AUTHENTICATED,
    );
  });
});
