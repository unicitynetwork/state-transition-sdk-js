import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { TrustBaseHistory } from '../../src/api/bft/trustbase/TrustBaseHistory.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { loadTrustBaseHistorySync, requiredEnv } from '../utils/TrustBaseFile.js';

/**
 * Aggregator endpoint under test. Defaults to a local aggregator; point
 * `AGGREGATOR_URL` at a real network (together with `TRUST_BASE_PATH`, `TRUST_BASE_GENESIS_PIN` and,
 * when the endpoint requires one, `AGGREGATOR_API_KEY`) to run against it.
 */
export const AGGREGATOR_URL = process.env.AGGREGATOR_URL ?? 'http://localhost:3000';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal']);

/**
 * Whether the client may send an API key over plaintext `http://`: only to a local stack or gateway
 * (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`), or to a remote host when `E2E_ALLOW_INSECURE=1`
 * says so explicitly. `https://` never needs it.
 *
 * @param {string} url Aggregator URL.
 * @param {NodeJS.ProcessEnv} env Environment to read `E2E_ALLOW_INSECURE` from.
 * @returns {boolean} The value for the client's `allowInsecureTransport` argument.
 */
export function allowInsecureTransportFor(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:') {
    return false;
  }
  return LOCAL_HOSTNAMES.has(parsed.hostname) || env.E2E_ALLOW_INSECURE === '1';
}

/**
 * Build the client and trust base the e2e suite runs against.
 *
 * @returns {object} Aggregator client, state transition client and trust base for the configured endpoint.
 */
export function createE2EContext(): {
  aggregatorClient: IAggregatorClient;
  client: StateTransitionClient;
  ready: Promise<void>;
  trustBase: TrustBaseHistory;
} {
  const aggregatorClient = new AggregatorClient(
    AGGREGATOR_URL,
    process.env.AGGREGATOR_API_KEY ?? null,
    // a local stack or gateway on http://: the client refuses to send an API key over plaintext otherwise
    allowInsecureTransportFor(AGGREGATOR_URL),
  );
  const { history, ready } = loadTrustBaseHistorySync(
    requiredEnv('TRUST_BASE_PATH'),
    requiredEnv('TRUST_BASE_GENESIS_PIN'),
  );

  return {
    aggregatorClient,
    client: new StateTransitionClient(aggregatorClient),
    ready,
    trustBase: history,
  };
}
