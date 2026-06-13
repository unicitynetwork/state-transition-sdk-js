import { InputRecord } from '../../../../src/api/bft/InputRecord.js';
import { ShardId } from '../../../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { DataHasher } from '../../../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';

/**
 * PR #110 66c8cb7 — fix shard tree certification root hash calculation.
 *
 * The bug: when ascending the shard tree, the SDK was hashing inner-tree siblings as raw
 * bytes. bft-go-base CBOR-byte-string-wraps each side via abhash.Hash.Write([]byte). Single
 * shard hides the bug (the loop never runs). Multi-shard fails verification with
 * INVALID_TRUSTBASE → UnicitySealHashMatchesWithRootHashRule: FAIL.
 *
 * Fix: each side passes through CborSerializer.encodeByteString(...) before feeding the
 * hasher. This unit test pins the byte-level composition so a future refactor can't silently
 * re-break it.
 */
describe('UnicityCertificate.calculateShardTreeCertificateRootHash', () => {
  function makeInputRecord(): InputRecord {
    return new InputRecord(
      1n, // roundNumber
      0n, // epoch
      null, // previousHash
      new Uint8Array(32).fill(0xaa), // hash
      new Uint8Array(8).fill(0), // summaryValue
      0n, // timestamp
      null, // blockHash
      0n, // sumOfEarnedFees
      null, // executedTransactionsHash
    );
  }

  it('with no siblings, the root hash is just sha256(IR || tech || cfg)', async () => {
    const inputRecord = makeInputRecord();
    const technicalRecordHash = null;
    const shardConfigurationHash = new Uint8Array(32).fill(0xbb);
    const cert = new ShardTreeCertificate(ShardId.decode(new Uint8Array([0x80])), []);

    const got = await UnicityCertificate.calculateShardTreeCertificateRootHash(
      inputRecord,
      technicalRecordHash,
      shardConfigurationHash,
      cert,
    );
    const expected = await new DataHasher(HashAlgorithm.SHA256)
      .update(inputRecord.toCBOR())
      .update(CborSerializer.encodeNullable(technicalRecordHash, CborSerializer.encodeByteString))
      .update(CborSerializer.encodeByteString(shardConfigurationHash))
      .digest();

    expect(Buffer.from(got.data).toString('hex')).toEqual(Buffer.from(expected.data).toString('hex'));
  });

  it('with one left-sibling, both sides are CBOR-byte-string-wrapped before hashing', async () => {
    // ShardId 1-bit '1' (0xc0 = '1' followed by trailing-1 marker) means at depth 0 we are
    // the right child, so the sibling is the left and we hash sibling||self in that order.
    const inputRecord = makeInputRecord();
    const technicalRecordHash = null;
    const shardConfigurationHash = new Uint8Array(32).fill(0xbb);
    const sibling = new Uint8Array(32).fill(0xcc);
    const cert = new ShardTreeCertificate(ShardId.decode(new Uint8Array([0xc0])), [sibling]);

    const baseHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(inputRecord.toCBOR())
      .update(CborSerializer.encodeNullable(technicalRecordHash, CborSerializer.encodeByteString))
      .update(CborSerializer.encodeByteString(shardConfigurationHash))
      .digest();
    // shardId.getBit(length-1-0) = getBit(0) = 1 → isRight=true → hash(sibling || baseHash)
    const expected = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(sibling))
      .update(CborSerializer.encodeByteString(baseHash.data))
      .digest();

    const got = await UnicityCertificate.calculateShardTreeCertificateRootHash(
      inputRecord,
      technicalRecordHash,
      shardConfigurationHash,
      cert,
    );

    expect(Buffer.from(got.data).toString('hex')).toEqual(Buffer.from(expected.data).toString('hex'));
  });

  it('with one right-sibling, the order is self || sibling and both are byte-string-wrapped', async () => {
    // ShardId 1-bit '0' (0x40) at depth 0 is the left child; sibling is the right.
    const inputRecord = makeInputRecord();
    const technicalRecordHash = null;
    const shardConfigurationHash = new Uint8Array(32).fill(0xbb);
    const sibling = new Uint8Array(32).fill(0xdd);
    const cert = new ShardTreeCertificate(ShardId.decode(new Uint8Array([0x40])), [sibling]);

    const baseHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(inputRecord.toCBOR())
      .update(CborSerializer.encodeNullable(technicalRecordHash, CborSerializer.encodeByteString))
      .update(CborSerializer.encodeByteString(shardConfigurationHash))
      .digest();
    const expected = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(baseHash.data))
      .update(CborSerializer.encodeByteString(sibling))
      .digest();

    const got = await UnicityCertificate.calculateShardTreeCertificateRootHash(
      inputRecord,
      technicalRecordHash,
      shardConfigurationHash,
      cert,
    );

    expect(Buffer.from(got.data).toString('hex')).toEqual(Buffer.from(expected.data).toString('hex'));
  });
});
