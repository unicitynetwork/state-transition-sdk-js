import { createIntegrationContext } from './IntegrationConfig.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('Integration TransitionFlow', () => {
  const { client, ready, trustBase } = createIntegrationContext();

  beforeAll(() => ready);

  transitionFlowTest(client, trustBase);
});
