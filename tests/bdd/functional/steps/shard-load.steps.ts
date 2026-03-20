import { Given, Then, When } from '@cucumber/cucumber';

import { ShardLoadReporter } from '../support/ShardLoadReporter.js';
import { ShardLoadRunner } from '../support/ShardLoadRunner.js';
import { createTestSetup, createUser } from '../support/TestSetup.js';
import { LOAD_TEST_TIMEOUT, TokenWorld } from '../support/World.js';

function buildShardUrls(shardIdLength: number): Map<number, string> | null {
  const baseId = 1 << shardIdLength;
  if (!process.env[`SHARD_${baseId}_URL`]) {
    return null;
  }
  const expectedCount = 1 << shardIdLength;
  const urls = new Map<number, string>();

  for (let i = 0; i < expectedCount; i++) {
    const shardId = baseId + i;
    const url = process.env[`SHARD_${shardId}_URL`];
    if (url) {
      urls.set(shardId, url);
    }
  }

  return urls.size > 0 ? urls : null;
}

function makeCsvPath(strategy: string): string {
  const outputDir = process.env.LOAD_TEST_OUTPUT_DIR ?? '.';
  const slug = strategy.toLowerCase().replace(/\s+/g, '-');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${outputDir}/shard-load-${slug}-${timestamp}.csv`;
}

Given('the aggregator is set up', function (this: TokenWorld): void {
  this.setup = createTestSetup();
});

Given('the shard topology is discovered', function (this: TokenWorld): void {
  this.shardIdLength = parseInt(process.env.SHARD_ID_LENGTH ?? '1', 10);
  this.shardCount = 1 << this.shardIdLength;
  console.log(`[ShardLoad] Topology: shardIdLength=${this.shardIdLength}, shardCount=${this.shardCount}`);
});

Given(
  '{int} mint operations are prepared for each shard',
  { timeout: LOAD_TEST_TIMEOUT },
  async function (this: TokenWorld, opsPerShard: number): Promise<void> {
    const user = createUser();
    const shardUrls = buildShardUrls(this.shardIdLength);
    this.loadTestRunner = new ShardLoadRunner(this.setup, user, shardUrls);
    this.preparedOperations = await this.loadTestRunner.prepareOperations(opsPerShard, this.shardIdLength);
  },
);

Given(
  '{int} x {int} mint operations are prepared for each shard',
  { timeout: LOAD_TEST_TIMEOUT },
  async function (this: TokenWorld, batchSize: number, batchCount: number): Promise<void> {
    const user = createUser();
    const shardUrls = buildShardUrls(this.shardIdLength);
    this.loadTestRunner = new ShardLoadRunner(this.setup, user, shardUrls);
    const opsPerShard = batchSize * batchCount;
    this.preparedOperations = await this.loadTestRunner.prepareOperations(opsPerShard, this.shardIdLength);
  },
);

When(
  'synchronized batches of {int} are submitted {int} times',
  { timeout: LOAD_TEST_TIMEOUT },
  async function (this: TokenWorld, batchSize: number, batchCount: number): Promise<void> {
    const csvPath = makeCsvPath('synchronized-batches');
    this.loadTestReport = await this.loadTestRunner.runSynchronizedBatches(
      this.preparedOperations,
      batchSize,
      batchCount,
      csvPath,
    );
  },
);

When(
  'independent batches of {int} are submitted {int} times per shard',
  { timeout: LOAD_TEST_TIMEOUT },
  async function (this: TokenWorld, batchSize: number, batchCount: number): Promise<void> {
    const csvPath = makeCsvPath('independent-batches');
    this.loadTestReport = await this.loadTestRunner.runIndependentBatches(
      this.preparedOperations,
      batchSize,
      batchCount,
      csvPath,
    );
  },
);

When(
  'constant pressure of {int} concurrent operations is applied per shard',
  { timeout: LOAD_TEST_TIMEOUT },
  async function (this: TokenWorld, concurrency: number): Promise<void> {
    const csvPath = makeCsvPath('constant-pressure');
    this.loadTestReport = await this.loadTestRunner.runConstantPressure(this.preparedOperations, concurrency, csvPath);
  },
);

Then('the shard load report is printed', function (this: TokenWorld): void {
  ShardLoadReporter.printReport(this.loadTestReport);
});
