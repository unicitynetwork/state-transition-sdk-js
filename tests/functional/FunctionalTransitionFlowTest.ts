import * as fs from 'fs';
import * as path from 'path';

import { TestAggregatorClient } from './TestAggregatorClient.js';
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('Functional TransitionFlow', () => {
  //   const aggregatorClient = TestAggregatorClient.create();
  const aggregatorClient = new AggregatorClient('http://192.168.43.106:3000');

  const client = new StateTransitionClient(aggregatorClient);

  //   const trustBase = aggregatorClient.rootTrustBase;
  const trustBaseJsonString = fs.readFileSync(path.join(__dirname, 'trust-base.json'), 'utf-8');
  console.log(trustBaseJsonString);
  trustBase = RootTrustBase.fromJSON(JSON.parse(trustBaseJsonString));

  transitionFlowTest(client, trustBase);
});
