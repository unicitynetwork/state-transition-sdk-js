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

describe('Sparse Merkle Tree tests', function () {
  const leavesSparse = [
    new Uint8Array([0b10010000]),
    new Uint8Array([0b00000000]),
    new Uint8Array([0b00010000]),
    new Uint8Array([0b10000000]),
    new Uint8Array([0b01100000]),
    new Uint8Array([0b00010100]),
  ];

  it('tree should be half calculated', async () => {
    const hashFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleTree(hashFactory);

    void smt.addLeaf(new Uint8Array([0b10]), new Uint8Array([1, 2, 3]));
    await smt.calculateRoot();
    await smt.addLeaf(new Uint8Array([0b11]), new Uint8Array([1, 2, 3, 4]));
    const testSmt = smt as unknown as {
      left: Promise<{ hash: DataHash; path: bigint }>;
      right: Promise<{ path: bigint }>;
    };
    await expect(testSmt.left).resolves.toEqual(
      await new PendingLeafBranch(0b100000010n, new Uint8Array([2]), new Uint8Array([1, 2, 3])).finalize(hashFactory),
    );

    await expect(testSmt.right).resolves.toEqual(
      new PendingLeafBranch(0b100000011n, new Uint8Array([3]), new Uint8Array([1, 2, 3, 4])),
    );
  });

  it('should verify the tree', async () => {
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const textEncoder = new TextEncoder();

    for (let i = 0; i < leavesSparse.length; i++) {
      void smt.addLeaf(leavesSparse[i], textEncoder.encode(`value${i}`));
    }

    await expect(smt.addLeaf(new Uint8Array([0b00000000]), textEncoder.encode('OnPath'))).rejects.toThrow(
      'Cannot add leaf inside branch.',
    );
    await expect(
      smt.addLeaf(new Uint8Array([0b00000000, 0b00000000]), textEncoder.encode('ThroughLeaf')),
    ).rejects.toThrow('Cannot extend tree through leaf.');

    const root = await smt.calculateRoot();

    expect(root.hash.imprint).toStrictEqual(
      HexConverter.decode('000008fabbfb859f0b47e389fb76ed1a2a1dca39b2ac4fb760e3544461feede55043'),
    );
  });

  it('inclusion certificate create and verify', async () => {
    const hashFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleTree(hashFactory);

    // Pad 1-byte leavesSparse keys to 32 bytes so they are compatible with StateId and DataHash
    const keys = leavesSparse.map((k) => {
      const padded = new Uint8Array(32);
      padded.set(k);
      return padded;
    });

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
    const missingKey = new Uint8Array(32);
    missingKey[0] = 0b00110000;
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

    void smt.addLeaf(new Uint8Array([0b00000000]), textEncoder.encode('A'));
    void smt.addLeaf(new Uint8Array([0b00000001]), textEncoder.encode('B'));
    const root1 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedLeafBranch);
      expect(root.right).toBeInstanceOf(FinalizedLeafBranch);
    });
    void smt.addLeaf(new Uint8Array([0b00000010]), textEncoder.encode('C'));
    const root2 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedNodeBranch);
      expect(root.right).toBeInstanceOf(FinalizedLeafBranch);
    });

    void smt.addLeaf(new Uint8Array([0b00000011]), textEncoder.encode('D'));
    const root3 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedNodeBranch);
      expect(root.right).toBeInstanceOf(FinalizedNodeBranch);
    });
    await Promise.all([root1, root2, root3]);
  });
});
