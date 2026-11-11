import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { DockerComposeEnvironment, Wait } from 'testcontainers';

const COMPOSE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docker');
const DATA_DIR = path.join(COMPOSE_DIR, 'data');
const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** The trust-base history the aggregator serves, as fetched once the stack certifies: the bundle the suite derives its pin from. */
const TRUST_BASE_PATH = path.join(DATA_DIR, 'trust-base-history.cbor');

/** The aggregator's own port inside the container; the host port is ephemeral. */
const AGGREGATOR_PORT = 3000;
/** Genesis, a replica-set election and the first certified round, on a cold start. */
const STARTUP_TIMEOUT_MS = 240000;

/**
 * The images of the stack, named after the commits pinned in stack.env, built by build-images.sh when the daemon lacks them.
 *
 * @returns {Promise<{aggregator: string, bft: string}>} The image tags.
 */
async function stackImages() {
  const pins = Object.fromEntries(
    (await readFile(path.join(SUPPORT_DIR, '..', 'stack.env'), 'utf8'))
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => line.split('=', 2)),
  );
  await promisify(execFile)('bash', [path.join(SUPPORT_DIR, 'build-images.sh')], { maxBuffer: 1 << 26 });
  return {
    aggregator: `sdk-it/aggregator:${pins.AGGREGATOR_SHA.slice(0, 12)}`,
    bft: `sdk-it/bft-core:${pins.BFT_CORE_SHA.slice(0, 12)}`,
  };
}

/**
 * Ask the aggregator for the trust-base history it serves (GET /api/v1/trustbases from the genesis epoch), the way the SDK's own source does.
 *
 * @param {string} url Aggregator base URL.
 * @returns {Promise<Uint8Array>} The complete GetTrustBase answer.
 * @throws {Error} If the aggregator does not answer with the history.
 */
async function fetchTrustBaseHistory(url) {
  const response = await fetch(`${url}/api/v1/trustbases?from=1&maxEntries=64`, {
    headers: { Accept: 'application/cbor' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`GET /api/v1/trustbases answered ${response.status}: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Ask the aggregator for its block height.
 *
 * @param {string} url Aggregator base URL.
 * @returns {Promise<bigint|null>} Height, or null if it cannot be read yet.
 */
async function blockHeight(url) {
  try {
    const response = await fetch(url, {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_block_height', params: {} }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    const { result } = await response.json();
    return result?.blockNumber != null ? BigInt(result.blockNumber) : null;
  } catch {
    return null;
  }
}

/**
 * Block until consensus is certifying rounds.
 *
 * A healthy aggregator is not a usable one: until consensus hands it a
 * reference time it answers every certification request with
 * SERVICE_NOT_READY, so the tests would fail on a service that is merely
 * still starting.
 *
 * @param {string} url Aggregator base URL.
 * @returns {Promise<void>} Resolves once a block has been certified.
 * @throws {Error} If no block is certified before the startup timeout.
 */
async function waitForCertification(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const height = await blockHeight(url);
    if (height != null && height > 0n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Aggregator at ${url} did not certify a block within ${STARTUP_TIMEOUT_MS}ms.`);
}

/**
 * Start the aggregator stack the integration suite runs against.
 *
 * The suite always runs against a stack it started itself, on a chain that
 * begins empty. Pointing it at a service someone else is running is what the
 * e2e suite is for; letting it happen here would mean a green integration run
 * proved nothing about the compose file it is supposed to be exercising.
 *
 * @returns {Promise<{stop: () => Promise<void>, trustBasePath: string, url: string}>} The running stack.
 */
export async function startAggregatorStack() {
  // Genesis is bind-mounted and survives a container teardown. Reusing it
  // against the fresh mongodb and redis volumes below would pair a chain that
  // remembers nothing with a root node that remembers everything.
  await rm(DATA_DIR, { force: true, recursive: true });
  await mkdir(path.join(DATA_DIR, 'genesis'), { recursive: true });
  await mkdir(path.join(DATA_DIR, 'genesis-root'), { recursive: true });

  const images = await stackImages();
  const environment = await new DockerComposeEnvironment(COMPOSE_DIR, 'docker-compose.yml')
    .withEnvironment({
      AGGREGATOR_IMAGE: images.aggregator,
      BFT_CORE_IMAGE: images.bft,
      // Port 0 publishes on an ephemeral host port, so concurrent runs and CI
      // jobs cannot collide on a fixed one.
      AGGREGATOR_PORT: '0',
      USER_GID: String(process.getgid?.() ?? 1001),
      USER_UID: String(process.getuid?.() ?? 1001),
    })
    .withWaitStrategy(
      'aggregator-1',
      Wait.forHttp('/health', AGGREGATOR_PORT).forStatusCode(200).withStartupTimeout(STARTUP_TIMEOUT_MS),
    )
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .up();

  const aggregator = environment.getContainer('aggregator-1');
  const url = `http://${aggregator.getHost()}:${aggregator.getMappedPort(AGGREGATOR_PORT)}`;
  await waitForCertification(url);
  await writeFile(TRUST_BASE_PATH, await fetchTrustBaseHistory(url));
  // the pin the genesis step wrote beside the genesis entry: the suite cross-checks the one it derives from the served bundle against it
  const genesisId = (await readFile(path.join(DATA_DIR, 'genesis', 'utb', 'genesis.id'), 'utf8')).trim();

  return {
    stop: async () => {
      await environment.down({ removeVolumes: true });
      await rm(DATA_DIR, { force: true, recursive: true });
    },
    genesisId,
    trustBasePath: TRUST_BASE_PATH,
    url,
  };
}
