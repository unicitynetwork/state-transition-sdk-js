import { RootTrustBase } from '../../../src/bft/RootTrustBase.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import {
  testOfflineTransferFlow,
  testSplitFlow,
  testSplitFlowAfterTransfer,
  testTransferFlow,
} from '../../token/CommonTestFlow.js';
import { TestAggregatorClient } from '../../unit/TestAggregatorClient.js';

describe('Transition', function () {
  let client: StateTransitionClient;
  let trustBase: RootTrustBase;

  beforeEach(() => {
    const aggregatorClient = TestAggregatorClient.create();
    client = new StateTransitionClient(aggregatorClient);
    trustBase = aggregatorClient.rootTrustBase;
  });

  it('should verify the token transfer', async () => {
    await testTransferFlow(trustBase, client);
  }, 15000);

  it('should verify the token offline transfer', async () => {
    await testOfflineTransferFlow(trustBase, client);
  }, 30000);

  it('should split tokens', async () => {
    await testSplitFlow(trustBase, client);
  }, 15000);

  it('should split tokens after transfer', async () => {
    await testSplitFlowAfterTransfer(trustBase, client);
  }, 15000);
});
