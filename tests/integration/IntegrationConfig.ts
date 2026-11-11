import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { ITrustBaseHistory } from '../../src/api/bft/trustbase/ITrustBaseHistory.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { openLocalHistorySync } from '../utils/TrustBaseFile.js';

/**
 * Read a value the stack published, or say why it is missing.
 *
 * Both are set by tests/integration/support/globalSetup.mjs once the stack it
 * started is certifying. Their absence means this suite was run without
 * jest.integration.config.js, so no stack exists to talk to.
 *
 * @param {string} name Environment variable to read.
 * @returns {string} Its value.
 * @throws {Error} If the variable is unset.
 */
function fromStack(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is unset. Run the integration suite with \`npm run test:integration\`.`);
  }

  return value;
}

/**
 * Build the client and trust base the integration suite runs against.
 *
 * The endpoint and trust base come from the stack Testcontainers started for
 * this run — a fresh chain, and the trust-base history its aggregator serves, whose genesis
 * entry the root was started with. The suite derives its pin from that bundle
 * (the local-network path, `TrustBaseSession.openLocal`). Nothing here is configurable: a run that could be pointed elsewhere
 * would not be testing the compose file it exists to exercise, and pointing the
 * SDK at a deployed network is what the e2e suite does.
 *
 * @returns {object} Aggregator client, state transition client and trust base for this run's stack.
 */
export function createIntegrationContext(): {
  aggregatorClient: IAggregatorClient;
  client: StateTransitionClient;
  ready: Promise<void>;
  trustBase: ITrustBaseHistory;
} {
  const aggregatorClient = new AggregatorClient(fromStack('AGGREGATOR_URL'), null);
  const { history, ready } = openLocalHistorySync(fromStack('TRUST_BASE_PATH'), fromStack('STACK_GENESIS_ID'));

  return {
    aggregatorClient,
    client: new StateTransitionClient(aggregatorClient),
    ready,
    trustBase: history,
  };
}
