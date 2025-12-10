import { numberToBytesBE } from '@noble/curves/utils.js';

import { InputRecord } from '../../src/api/bft/InputRecord.js';
import { ShardTreeCertificate } from '../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../src/api/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../src/api/bft/UnicityTreeCertificate.js';
import { DataHash } from '../../src/crypto/hash/DataHash.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';

export async function createUnicityCertificate(
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

  const seal = await UnicitySeal.create(
    0n,
    0n,
    0n,
    0n,
    0n,
    null,
    unicitySealHash.data,
    new Map([['NODE', signingService]]),
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
