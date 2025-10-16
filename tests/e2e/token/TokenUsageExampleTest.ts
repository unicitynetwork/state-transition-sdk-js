import * as fs from 'fs';
import * as path from 'path';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/bft/RootTrustBase.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import {
  testTransferFlow,
  testSplitFlow,
  testSplitFlowAfterTransfer,
  testOfflineTransferFlow,
} from '../../token/CommonTestFlow.js';

describe('Transition', function () {
  let trustBase: RootTrustBase;

  beforeAll(async () => {
    const trustBaseJsonString = fs.readFileSync(path.join(__dirname, 'trust-base.json'), 'utf-8');
    trustBase = RootTrustBase.fromJSON(JSON.parse(trustBaseJsonString))
  });

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

  it('should verify the token transfer', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testTransferFlow(trustBase, client);
  }, 15000);

  it('should verify the token offline transfer', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testOfflineTransferFlow(trustBase, client);
  }, 15000);

  it('should split tokens', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testSplitFlow(trustBase, client);
  }, 15000);

  it('should split tokens after transfer', async () => {
    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
      console.warn('Skipping test: AGGREGATOR_URL environment variable is not set');
      return;
    }
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    await testSplitFlowAfterTransfer(trustBase, client);
  }, 25000);
});
