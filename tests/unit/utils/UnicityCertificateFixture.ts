import { numberToBytesBE } from '@noble/curves/utils.js';

import { InputRecord } from '../../../src/bft/InputRecord.js';
import { ShardTreeCertificate } from '../../../src/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../../src/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../../src/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../../src/bft/UnicityTreeCertificate.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { DataHasher } from '../../../src/hash/DataHasher.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { CborSerializer } from '../../../src/serializer/cbor/CborSerializer.js';
import { SigningService } from '../../../src/sign/SigningService.js';

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
