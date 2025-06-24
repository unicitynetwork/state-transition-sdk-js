import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import {
  testTransferFlow,
  testSplitFlow,
  testSplitFlowAfterTransfer,
  testOfflineTransferFlow,
} from '../../token/CommonTestFlow.js';

describe('Transition', function () {
  it('should verify block height', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new AggregatorClient(aggregatorUrl);
    const bh = await client.getBlockHeight();
    console.log('block height: ', bh);
  });

  it('should verify the token latest state', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testTransferFlow(client);
  }, 15000);

  it('should verify the token latest state', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testOfflineTransferFlow(client);
  }, 15000);

  it('should split tokens', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testSplitFlow(client);
  }, 15000);

  it('should split tokens after transfer', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testSplitFlowAfterTransfer(client);
  }, 25000);
});
