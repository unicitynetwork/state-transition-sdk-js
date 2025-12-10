import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { InclusionProof } from '../../../src/api/InclusionProof.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { DataHasherFactory } from '../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/crypto/hash/NodeDataHasher.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicateVerifier } from '../../../src/predicate/verification/PayToPublicKeyPredicateVerifier.js';
import { PredicateVerifierFactory } from '../../../src/predicate/verification/PredicateVerifierFactory.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { SparseMerkleTree } from '../../../src/smt/plain/SparseMerkleTree.js';
import { SparseMerkleTreePath } from '../../../src/smt/plain/SparseMerkleTreePath.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../../../src/transaction/verification/rule/InclusionProofVerificationRule.js';
import { createRootTrustBase } from '../../utils/RootTrustBaseFixture.js';
import { createUnicityCertificate } from '../../utils/UnicityCertificateFixture.js';

describe('InclusionProof', () => {
  const signingService = new SigningService(
    new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
  );

  const predicateVerifierFactory = new PredicateVerifierFactory(new Map([[1n, new PayToPublicKeyPredicateVerifier()]]));

  let certificationData: CertificationData;
  let merkleTreePath: SparseMerkleTreePath;
  let unicityCertificate: UnicityCertificate;
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    certificationData = CertificationData.fromJSON({
      publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      signature:
        '8c3f91708445bf0ddec220f0821461bcf84860a8769275f9930e798d1f645d157bb6a2998c61941108b0993c5aed6a7b92ccf31d11b50fe80d9ff93da392336a01',
      sourceStateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      transactionHash: '00000000000000000000000000000000000000000000000000000000000000000000',
    });

    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const stateId = await StateId.fromCertificationData(certificationData).then((stateId) =>
      stateId.toBitString().toBigInt(),
    );
    await smt.addLeaf(stateId, await certificationData.calculateLeafValue().then((value) => value.imprint));

    const root = await smt.calculateRoot();

    merkleTreePath = root.getPath(stateId);

    unicityCertificate = await createUnicityCertificate(root.hash, signingService);
    trustBase = createRootTrustBase(signingService.publicKey);
  });

  it('should encode and decode json', () => {
    const inclusionProof = new InclusionProof(merkleTreePath, certificationData, unicityCertificate);
    expect(inclusionProof.toJSON()).toEqual({
      certificationData: certificationData.toJSON(),
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
    const inclusionProof = new InclusionProof(merkleTreePath, certificationData, unicityCertificate);

    expect(inclusionProof.toCBOR()).toStrictEqual(
      CborSerializer.encodeArray(merkleTreePath.toCBOR(), certificationData.toCBOR(), unicityCertificate.toCBOR()),
    );
    expect(InclusionProof.fromCBOR(inclusionProof.toCBOR())).toStrictEqual(inclusionProof);

    expect(
      InclusionProof.fromCBOR(
        CborSerializer.encodeArray(merkleTreePath.toCBOR(), CborSerializer.encodeNull(), unicityCertificate.toCBOR()),
      ),
    ).toStrictEqual(new InclusionProof(merkleTreePath, null, unicityCertificate));
  });

  it('verifies', async () => {
    const stateId = await StateId.fromCertificationData(certificationData);
    const inclusionProof = new InclusionProof(merkleTreePath, certificationData, unicityCertificate);

    await expect(
      InclusionProofVerificationRule.verify(trustBase, predicateVerifierFactory, inclusionProof, stateId).then(
        (result) => result.status,
      ),
    ).resolves.toEqual(InclusionProofVerificationStatus.OK);
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifierFactory,
        inclusionProof,
        StateId.fromJSON('00000000000000000000000000000000000000000000000000000000000000000000'),
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);

    const invalidTransactionHashInclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromJSON({
        publicKey: HexConverter.encode(certificationData.lockScript.encode()),
        signature: HexConverter.encode(certificationData.unlockScript),
        sourceStateHash: certificationData.sourceStateHash.toJSON(),
        transactionHash: DataHash.fromImprint(
          HexConverter.decode('00000000000000000000000000000000000000000000000000000000000000000001'),
        ).toJSON(),
      }),
      unicityCertificate,
    );

    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifierFactory,
        invalidTransactionHashInclusionProof,
        stateId,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.NOT_AUTHENTICATED);
  });

  it('verification fails with invalid transaction hash', async () => {
    const stateId = await StateId.fromCertificationData(certificationData);

    const inclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromJSON({
        publicKey: HexConverter.encode(certificationData.lockScript.encode()),
        signature: HexConverter.encode(certificationData.unlockScript),
        sourceStateHash: certificationData.sourceStateHash.toJSON(),
        transactionHash: DataHash.fromImprint(
          HexConverter.decode('00000000000000000000000000000000000000000000000000000000000000000001'),
        ).toJSON(),
      }),
      unicityCertificate,
    );

    await expect(
      InclusionProofVerificationRule.verify(trustBase, predicateVerifierFactory, inclusionProof, stateId).then(
        (result) => result.status,
      ),
    ).resolves.toEqual(InclusionProofVerificationStatus.NOT_AUTHENTICATED);
  });

  it('verification fails with invalid trustbase', async () => {
    const stateId = await StateId.fromCertificationData(certificationData);

    const inclusionProof = new InclusionProof(merkleTreePath, certificationData, unicityCertificate);

    await expect(
      InclusionProofVerificationRule.verify(
        createRootTrustBase(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
        new PredicateVerifierFactory(new Map([[1n, new PayToPublicKeyPredicateVerifier()]])),
        inclusionProof,
        stateId,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.INVALID_TRUSTBASE);
  });
});
