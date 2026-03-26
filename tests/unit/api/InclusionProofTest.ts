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
import { PayToPublicKeyPredicate } from '../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { SparseMerkleTree } from '../../../src/smt/plain/SparseMerkleTree.js';
import { SparseMerkleTreePath } from '../../../src/smt/plain/SparseMerkleTreePath.js';
import { Address } from '../../../src/transaction/Address.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
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

  let predicateVerifier: PredicateVerifierService;
  let transaction: MintTransaction;
  let certificationData: CertificationData;
  let merkleTreePath: SparseMerkleTreePath;
  let unicityCertificate: UnicityCertificate;
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    transaction = await MintTransaction.create(
      await Address.fromPredicate(PayToPublicKeyPredicate.fromSigningService(signingService)),
      new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      new TokenType(crypto.getRandomValues(new Uint8Array(32))),
      new Uint8Array(),
    );
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const stateId = await StateId.fromTransaction(transaction).then((stateId) => stateId.toBitString().toBigInt());
    certificationData = await CertificationData.fromMintTransaction(transaction);

    await smt.addLeaf(stateId, await certificationData.calculateLeafValue().then((value) => value.imprint));

    const root = await smt.calculateRoot();

    merkleTreePath = root.getPath(stateId);

    unicityCertificate = await createUnicityCertificate(root.hash, signingService);
    trustBase = createRootTrustBase(signingService.publicKey);
    predicateVerifier = PredicateVerifierService.create(trustBase);
  });

  it('should encode and decode cbor', () => {
    const inclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromCBOR(certificationData.toCBOR()),
      unicityCertificate,
    );

    expect(inclusionProof.toCBOR()).toStrictEqual(
      CborSerializer.encodeArray(certificationData.toCBOR(), merkleTreePath.toCBOR(), unicityCertificate.toCBOR()),
    );
    expect(InclusionProof.fromCBOR(inclusionProof.toCBOR())).toStrictEqual(inclusionProof);

    expect(
      InclusionProof.fromCBOR(
        CborSerializer.encodeArray(CborSerializer.encodeNull(), merkleTreePath.toCBOR(), unicityCertificate.toCBOR()),
      ),
    ).toStrictEqual(new InclusionProof(merkleTreePath, null, unicityCertificate));
  });

  it('verifies', async () => {
    const inclusionProof = new InclusionProof(merkleTreePath, certificationData, unicityCertificate);

    await expect(
      InclusionProofVerificationRule.verify(trustBase, predicateVerifier, inclusionProof, transaction).then(
        (result) => result.status,
      ),
    ).resolves.toEqual(InclusionProofVerificationStatus.OK);
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        inclusionProof,
        await MintTransaction.create(
          await Address.fromPredicate(transaction.lockScript),
          new TokenId(crypto.getRandomValues(new Uint8Array(32))),
          transaction.tokenType,
          transaction.data,
        ),
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);

    const invalidTransactionHashInclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromCBOR(
        CborSerializer.encodeArray(
          EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
          CborSerializer.encodeByteString(certificationData.sourceStateHash.data),
          CborSerializer.encodeByteString(
            DataHash.fromImprint(
              HexConverter.decode('00000000000000000000000000000000000000000000000000000000000000000001'),
            ).data,
          ),
          CborSerializer.encodeByteString(certificationData.unlockScript),
        ),
      ),
      unicityCertificate,
    );
    await expect(
      InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        invalidTransactionHashInclusionProof,
        transaction,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH);
  });

  it('verification fails with invalid transaction hash', async () => {
    const inclusionProof = new InclusionProof(
      merkleTreePath,
      CertificationData.fromCBOR(
        CborSerializer.encodeArray(
          EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
          CborSerializer.encodeByteString(certificationData.sourceStateHash.data),
          CborSerializer.encodeByteString(certificationData.transactionHash.data),
          CborSerializer.encodeByteString(new Uint8Array(65)),
        ),
      ),
      unicityCertificate,
    );

    await expect(
      InclusionProofVerificationRule.verify(trustBase, predicateVerifier, inclusionProof, transaction).then(
        (result) => result.status,
      ),
    ).resolves.toEqual(InclusionProofVerificationStatus.NOT_AUTHENTICATED);
  });

  it('verification fails with invalid trustbase', async () => {
    const inclusionProof = new InclusionProof(merkleTreePath, certificationData, unicityCertificate);

    await expect(
      InclusionProofVerificationRule.verify(
        createRootTrustBase(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
        predicateVerifier,
        inclusionProof,
        transaction,
      ).then((result) => result.status),
    ).resolves.toEqual(InclusionProofVerificationStatus.INVALID_TRUSTBASE);
  });
});
