import { CertificationData } from '../../../src/api/CertificationData.js';
import { StateId } from '../../../src/api/StateId.js';
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

  let certificateData: CertificationData;
  let merkleTreePath: SparseMerkleTreePath;
  let unicityCertificate: UnicityCertificate;
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    certificateData = await CertificationData.create(
      DataHash.fromImprint(new Uint8Array(34)),
      DataHash.fromImprint(new Uint8Array(34)),
      signingService,
    );

    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const stateId = await certificateData.calculateStateId().then((stateId) => stateId.toBitString().toBigInt());
    await smt.addLeaf(stateId, await certificateData.calculateLeafValue().then((value) => value.imprint));

    const root = await smt.calculateRoot();

    merkleTreePath = root.getPath(stateId);

    unicityCertificate = await createUnicityCertificate(root.hash, signingService);
    trustBase = createRootTrustBase(signingService.publicKey);
  });

  it('should encode and decode json', () => {
    const inclusionProof = new InclusionProof(merkleTreePath, certificateData, unicityCertificate);
    expect(inclusionProof.toJSON()).toEqual({
      certificationData: certificateData.toJSON(),
      merkleTreePath: merkleTreePath.toJSON(),
      unicityCertificate: unicityCertificate.toJSON(),
    });

    expect(InclusionProof.fromJSON(inclusionProof.toJSON())).toStrictEqual(inclusionProof);
    expect(
      InclusionProof.fromJSON({
        certificationData: null,
        merkleTreePath: merkleTreePath.toJSON(),
        unicityCertificate: unicityCertificate.toJSON(),
      }),
    ).toStrictEqual(new InclusionProof(merkleTreePath, null, unicityCertificate));
  });

  it('should encode and decode cbor', () => {
    const inclusionProof = new InclusionProof(merkleTreePath, certificateData, unicityCertificate);

    expect(inclusionProof.toCBOR()).toStrictEqual(
      CborSerializer.encodeArray(merkleTreePath.toCBOR(), certificateData.toCBOR(), unicityCertificate.toCBOR()),
    );
    expect(InclusionProof.fromCBOR(inclusionProof.toCBOR())).toStrictEqual(inclusionProof);

    expect(
      InclusionProof.fromCBOR(
        CborSerializer.encodeArray(merkleTreePath.toCBOR(), CborSerializer.encodeNull(), unicityCertificate.toCBOR()),
      ),
    ).toStrictEqual(new InclusionProof(merkleTreePath, null, unicityCertificate));
  });

  it('verifies', async () => {
    const stateId = await StateId.create(signingService.publicKey, certificateData.sourceStateHash);
    const inclusionProof = new InclusionProof(merkleTreePath, certificateData, unicityCertificate);

    expect(await inclusionProof.verify(trustBase, stateId)).toEqual(InclusionProofVerificationStatus.OK);
    expect(
      await inclusionProof.verify(trustBase, await StateId.createFromImprint(new Uint8Array(32), new Uint8Array(34))),
    ).toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);

    const invalidTransactionHashInclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromJSON({
        publicKey: HexConverter.encode(certificateData.publicKey),
        signature: certificateData.signature.toJSON(),
        stateHash: certificateData.sourceStateHash.toJSON(),
        transactionHash: DataHash.fromImprint(
          HexConverter.decode('00000000000000000000000000000000000000000000000000000000000000000001'),
        ).toJSON(),
      }),
      unicityCertificate,
    );

    expect(await invalidTransactionHashInclusionProof.verify(trustBase, stateId)).toEqual(
      InclusionProofVerificationStatus.NOT_AUTHENTICATED,
    );
  });

  it('verification fails with invalid transaction hash', async () => {
    const stateId = await StateId.create(signingService.publicKey, certificateData.sourceStateHash);

    const inclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromJSON({
        publicKey: HexConverter.encode(certificateData.publicKey),
        signature: certificateData.signature.toJSON(),
        stateHash: certificateData.sourceStateHash.toJSON(),
        transactionHash: DataHash.fromImprint(
          HexConverter.decode('00000000000000000000000000000000000000000000000000000000000000000001'),
        ).toJSON(),
      }),
      unicityCertificate,
    );

    expect(await inclusionProof.verify(trustBase, stateId)).toEqual(InclusionProofVerificationStatus.NOT_AUTHENTICATED);
  });

  it('verification fails with invalid trustbase', async () => {
    const stateId = await StateId.create(signingService.publicKey, certificateData.sourceStateHash);

    const inclusionProof = new InclusionProof(merkleTreePath, certificateData, unicityCertificate);

    await expect(
      inclusionProof.verify(
        createRootTrustBase(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
        stateId,
      ),
    ).resolves.toEqual(InclusionProofVerificationStatus.INVALID_TRUSTBASE);
  });
});
