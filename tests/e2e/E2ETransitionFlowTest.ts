import { createE2EContext } from './E2EConfig.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('E2E TransitionFlow', () => {
  const { client, ready, trustBase } = createE2EContext();

  beforeAll(() => ready);

  transitionFlowTest(client, trustBase);
});
