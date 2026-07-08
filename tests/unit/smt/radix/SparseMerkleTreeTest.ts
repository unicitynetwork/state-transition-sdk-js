import { InclusionCertificate } from '../../../../src/api/InclusionCertificate.js';
import { StateId } from '../../../../src/api/StateId.js';
import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { DataHasherFactory } from '../../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../../src/crypto/hash/NodeDataHasher.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { FinalizedLeafBranch } from '../../../../src/smt/radix/FinalizedLeafBranch.js';
import { FinalizedNodeBranch } from '../../../../src/smt/radix/FinalizedNodeBranch.js';
import { PendingLeafBranch } from '../../../../src/smt/radix/PendingLeafBranch.js';
import { SparseMerkleTree } from '../../../../src/smt/radix/SparseMerkleTree.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

/** RSMT keys are 32 bytes; build one from a single low byte so the trie structure is easy to reason about. */
function key32(firstByte: number): Uint8Array {
  const key = new Uint8Array(32);
  key[0] = firstByte;
  return key;
}

describe('Sparse Merkle Tree tests', function () {
  const leavesSparse = [0b10010000, 0b00000000, 0b00010000, 0b10000000, 0b01100000, 0b00010100].map(key32);

  it('tree should be half calculated', async () => {
    const hashFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleTree(hashFactory);

    const key2 = key32(0b10);
    const key3 = key32(0b11);
    void smt.addLeaf(key2, new Uint8Array([1, 2, 3]));
    await smt.calculateRoot();
    await smt.addLeaf(key3, new Uint8Array([1, 2, 3, 4]));
    const testSmt = smt as unknown as {
      left: Promise<{ hash: DataHash; path: bigint }>;
      right: Promise<{ path: bigint }>;
    };
    await expect(testSmt.left).resolves.toEqual(
      await new PendingLeafBranch((1n << 256n) + 2n, key2, new Uint8Array([1, 2, 3])).finalize(hashFactory),
    );

    await expect(testSmt.right).resolves.toEqual(
      new PendingLeafBranch((1n << 256n) + 3n, key3, new Uint8Array([1, 2, 3, 4])),
    );
  });

  it('should verify the tree', async () => {
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const textEncoder = new TextEncoder();

    for (let i = 0; i < leavesSparse.length; i++) {
      void smt.addLeaf(leavesSparse[i], textEncoder.encode(`value${i}`));
    }

    // Re-adding an existing key lands inside an occupied branch.
    await expect(smt.addLeaf(key32(0b00000000), textEncoder.encode('OnPath'))).rejects.toThrow(
      'Cannot add leaf inside branch.',
    );

    const root = await smt.calculateRoot();

    expect(root.hash.imprint).toStrictEqual(
      HexConverter.decode('00000fbe49c19df8bbf8612951ea26c8b0c52088424ff48adacf56234fc567950e89'),
    );
  });

  it('inclusion certificate create and verify', async () => {
    const hashFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleTree(hashFactory);

    const keys = leavesSparse;
    const values = keys.map((_, i) => {
      const v = new Uint8Array(32);
      v[0] = i + 1;
      return v;
    });

    for (let i = 0; i < keys.length; i++) {
      void smt.addLeaf(keys[i], values[i]);
    }

    const root = await smt.calculateRoot();

    // Non-inclusion: key not in tree → create throws
    const missingKey = key32(0b00110000);
    expect(root.has(missingKey)).toBe(false);
    expect(() => InclusionCertificate.create(root, missingKey)).toThrow();

    // Inclusion: key IS in tree, cert verifies against root hash
    const cert = InclusionCertificate.create(root, keys[0]);
    const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(keys[0]));
    const leafValue = new DataHash(HashAlgorithm.SHA256, values[0]);
    await expect(cert.verify(stateId, leafValue, root.hash)).resolves.toBe(true);

    // Wrong key: cert for keys[0] does not verify for keys[1]
    const wrongStateId = StateId.fromCBOR(CborSerializer.encodeByteString(keys[1]));
    await expect(cert.verify(wrongStateId, leafValue, root.hash)).resolves.toBe(false);

    // Encode / decode round-trip preserves certificate
    expect(InclusionCertificate.decode(cert.encode()).encode()).toStrictEqual(cert.encode());

    // Empty root: create throws
    const emptyRoot = await new SparseMerkleTree(hashFactory).calculateRoot();
    expect(() => InclusionCertificate.create(emptyRoot, keys[0])).toThrow();
  });

  it('should handle concurrent addLeaf calls', async () => {
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const textEncoder = new TextEncoder();

    void smt.addLeaf(key32(0b00000000), textEncoder.encode('A'));
    void smt.addLeaf(key32(0b00000001), textEncoder.encode('B'));
    const root1 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedLeafBranch);
      expect(root.right).toBeInstanceOf(FinalizedLeafBranch);
    });
    void smt.addLeaf(key32(0b00000010), textEncoder.encode('C'));
    const root2 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedNodeBranch);
      expect(root.right).toBeInstanceOf(FinalizedLeafBranch);
    });

    void smt.addLeaf(key32(0b00000011), textEncoder.encode('D'));
    const root3 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedNodeBranch);
      expect(root.right).toBeInstanceOf(FinalizedNodeBranch);
    });
    await Promise.all([root1, root2, root3]);
  });
});
