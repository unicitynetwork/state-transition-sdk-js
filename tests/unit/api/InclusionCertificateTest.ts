import { InclusionCertificate } from '../../../src/api/InclusionCertificate.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { DataHasherFactory } from '../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/crypto/hash/NodeDataHasher.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { SparseMerkleTree } from '../../../src/smt/radix/SparseMerkleTree.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('InclusionCertificate', () => {
  const hashFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);

  it('multi-leaf deep bifurcations round-trip through encode/decode', async () => {
    const smt = new SparseMerkleTree(hashFactory);

    // Keys share the first 31 bytes and differ only in the last byte, forcing interior nodes down
    // to depth >= 248 so the MSB-first bitmap is exercised in its final byte across several bit positions.
    const keys = [0x01, 0x02, 0x03, 0x80, 0x81, 0xff].map((last) => {
      const key = new Uint8Array(32);
      key[31] = last;
      return key;
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

    for (let i = 0; i < keys.length; i++) {
      const cert = InclusionCertificate.create(root, keys[i]);
      const decoded = InclusionCertificate.decode(cert.encode());
      const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(keys[i]));
      const leafValue = new DataHash(HashAlgorithm.SHA256, values[i]);
      const reconstructed = await decoded.calculateRoot(stateId, leafValue);
      expect(reconstructed.equals(root.hash)).toBe(true);
    }
  });

  it('encodes to a stable wire format', async () => {
    const smt = new SparseMerkleTree(hashFactory);
    const keyA = new Uint8Array(32);
    const keyB = new Uint8Array(32);
    keyB[0] = 0x80;
    const keyC = new Uint8Array(32);
    keyC[0] = 0x40;
    await smt.addLeaf(keyA, new Uint8Array([0x01]));
    await smt.addLeaf(keyB, new Uint8Array([0x02]));
    await smt.addLeaf(keyC, new Uint8Array([0x03]));
    const root = await smt.calculateRoot();

    const cert = InclusionCertificate.create(root, keyA);
    expect(HexConverter.encode(cert.encode())).toBe(
      'c0000000000000000000000000000000000000000000000000000000000000' +
        '00004686ebcd0e7c0e2c954851924faaceba62e508876b75770655211ff9543959' +
        'c54cb54bd0d7d3601be1df64e7d37731ed2533ebd599bc4adde23753c5e64196',
    );
  });
});
