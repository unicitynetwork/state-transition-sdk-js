import { DataHasher } from '../../../src/hash/DataHasher.js';
import { DataHasherFactory } from '../../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/hash/NodeDataHasher.js';

describe('Data hasher factory', () => {
  it('should create hasher', () => {
    expect(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher).create()).toBeInstanceOf(DataHasher);
    expect(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher).create()).toBeInstanceOf(NodeDataHasher);
  });
});
