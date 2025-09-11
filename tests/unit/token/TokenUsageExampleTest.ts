import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { NodeDataHasher } from '@unicitylabs/commons/lib/hash/NodeDataHasher.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';

import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import {
  testTransferFlow,
  testSplitFlow,
  testSplitFlowAfterTransfer,
  testOfflineTransferFlow,
} from '../../token/CommonTestFlow.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';

describe('Transition', function () {
  const client = new StateTransitionClient(
    new TestAggregatorClient(new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher))),
  );

  it('should verify the token transfer', async () => {
    await testTransferFlow(client);
  }, 15000);

  it('should verify the token offline transfer', async () => {
    await testOfflineTransferFlow(client);
  }, 30000);

  it('should split tokens', async () => {
    await testSplitFlow(client);
  }, 15000);

  it('should split tokens after transfer', async () => {
    await testSplitFlowAfterTransfer(client);
  }, 15000);
});
