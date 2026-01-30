import { TestAggregatorClient } from './TestAggregatorClient.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('Functional TransitionFlow', () => {
  const aggregatorClient = TestAggregatorClient.create();
  const client = new StateTransitionClient(aggregatorClient);
  const trustBase = aggregatorClient.rootTrustBase;

  transitionFlowTest(client, trustBase);
});
