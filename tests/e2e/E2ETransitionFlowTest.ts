import trustBaseJson from './trust-base.json' with { type: 'json' };
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('E2E TransitionFlow', () => {
  const aggregatorClient = new AggregatorClient('http://localhost:3000');
  const client = new StateTransitionClient(aggregatorClient);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);

  transitionFlowTest(client, trustBase);
});
