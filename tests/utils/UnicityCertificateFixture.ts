import { numberToBytesBE } from '@noble/curves/utils.js';

import { REFERENCE_TIME } from './ReferenceTime.js';
import { FIXTURE_EPOCH } from './TrustBaseHistoryFixture.js';
import { AGGREGATION_PARTITION_ID } from '../../src/api/bft/AggregationPartition.js';
import { InputRecord } from '../../src/api/bft/InputRecord.js';
import { ShardId } from '../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../src/api/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../src/api/bft/UnicityTreeCertificate.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { DataHash } from '../../src/crypto/hash/DataHash.js';
import { DataHasher } from '../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';

/** Deviations from a certificate the native IsValid accepts, for negative tests: every one is still validly signed. */
export interface IUnicityCertificateOptions {
  /** Block hash of the input record; `null` is nil. Default: a hash, as the state hash changes. */
  readonly blockHash?: Uint8Array | null;
  /** Partition of the certificate. Default: the aggregation partition. */
  readonly partition?: bigint;
  /** Epoch of the seal. Default: the epoch of the fixture history. */
  readonly sealEpoch?: bigint;
  /** Round of the seal. Default 1. */
  readonly sealRound?: bigint;
  /** Timestamp of the seal. Default: the timestamp of the input record. */
  readonly sealTimestamp?: bigint;
  /** Summary value of the input record. Default: empty, not nil. */
  readonly summaryValue?: Uint8Array | null;
  /** Technical record hash. Default: 32 bytes. */
  readonly technicalRecordHash?: Uint8Array | null;
}

export async function createUnicityCertificate(
  rootHash: DataHash | Uint8Array | null,
  signingService: SigningService,
  timestamp: bigint = REFERENCE_TIME,
  options: IUnicityCertificateOptions = {},
): Promise<UnicityCertificate> {
  // a record the native IsValid accepts: a round with an assigned timestamp and summary; a changed state hash needs a
  // block hash, the certified empty tree (null or empty hash, like the null previous hash) is unchanged and has none
  const rootBytes = rootHash instanceof DataHash ? rootHash.data : rootHash;
  const blockHash =
    options.blockHash !== undefined
      ? options.blockHash
      : rootBytes === null || rootBytes.length === 0
        ? null
        : (await new DataHasher(HashAlgorithm.SHA256).update(rootBytes).digest()).data;
  const summaryValue = options.summaryValue !== undefined ? options.summaryValue : new Uint8Array(0);
  const inputRecord = new InputRecord(1n, 0n, null, rootBytes, summaryValue, timestamp, blockHash, 0n, null);
  const technicalRecordHash =
    options.technicalRecordHash !== undefined ? options.technicalRecordHash : new Uint8Array(32);
  const shardConfigurationHash = new Uint8Array(32);
  const shardTreeCertificate = new ShardTreeCertificate(ShardId.decode(new Uint8Array([0b10000000])), []);

  const shardTreeCertificateRootHash = await UnicityCertificate.calculateShardTreeCertificateRootHash(
    inputRecord,
    technicalRecordHash,
    shardConfigurationHash,
    shardTreeCertificate,
  );

  const partitionIdentifier = options.partition ?? AGGREGATION_PARTITION_ID;

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
    NetworkId.LOCAL,
    options.sealRound ?? 1n,
    options.sealEpoch ?? FIXTURE_EPOCH,
    options.sealTimestamp ?? timestamp,
    null,
    unicitySealHash.data,
    new Map([['NODE', signingService]]),
  );

  return new UnicityCertificate(
    inputRecord,
    technicalRecordHash,
    shardConfigurationHash,
    shardTreeCertificate,
    new UnicityTreeCertificate(partitionIdentifier, []),
    seal,
  );
}
