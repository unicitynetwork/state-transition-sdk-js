import { createWriteStream, WriteStream } from 'fs';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';

import { ShardAwareAggregatorClient } from './ShardAwareAggregatorClient.js';
import { ShardBlockMonitor } from './ShardBlockMonitor.js';
import { ShardLoadMintPool } from './ShardLoadMintPool.js';
import {
  IBlockRecord,
  ICommitmentValidation,
  ILoadTestReport,
  IPreparedOperation,
  IShardBatchResult,
  IShardOperationResult,
  IShardSummary,
  ITimeBucket,
} from './ShardLoadTypes.js';
import { ITestSetup, IUser } from './TestSetup.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { JsonRpcNetworkError } from '../../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { StateId } from '../../../../src/api/StateId.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { Address } from '../../../../src/transaction/Address.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../../../../src/transaction/verification/rule/InclusionProofVerificationRule.js';

const BLOCK_CSV_HEADER = 'shardId,blockNumber,commitments,createdAt,finalizationMs,throughput';
const CSV_HEADER =
  'shardId,stateId,success,failedPhase,error,commitDurationMs,proofWaitDurationMs,totalDurationMs,proofPollCount,startedAt,endedAt';
const PROOF_POLL_INTERVAL_MS = 1_000;
const PROOF_WAIT_TIMEOUT_MS = 30_000;
const TIME_BUCKET_STEP_MS = 1_000;

interface IShardRunningStats {
  commitSum: number;
  failures: number;
  histogram: Map<number, number>;
  maxTotal: number;
  minTotal: number;
  pollCountSum: number;
  proofWaitSum: number;
  successes: number;
  totalOps: number;
  totalSum: number;
}

function getMintPoolSize(shardCount: number): number {
  if (process.env.LOAD_TEST_MINT_POOL_SIZE) {
    return parseInt(process.env.LOAD_TEST_MINT_POOL_SIZE, 10);
  }
  return Math.min(shardCount, availableParallelism() - 2);
}

export class ShardLoadRunner {
  private cachedAddress: Address | null = null;
  private mintPool: ShardLoadMintPool | null = null;
  private readonly setup: ITestSetup;
  private readonly shardUrls: Map<number, string> | null;
  private readonly user: IUser;

  public constructor(setup: ITestSetup, user: IUser, shardUrls: Map<number, string> | null = null) {
    this.setup = setup;
    this.shardUrls = shardUrls;
    this.user = user;
  }

  private static buildCommitmentValidation(
    shardStats: Map<number, IShardRunningStats>,
    monitor: ShardBlockMonitor,
  ): Map<number, ICommitmentValidation> {
    const validation = new Map<number, ICommitmentValidation>();
    const totalCommitments = monitor.getTotalCommitments();

    for (const [shardId, stats] of shardStats) {
      const submitted = stats.successes;
      const finalized = totalCommitments.get(shardId) ?? 0;
      const match = submitted === finalized;

      if (!match) {
        console.log(
          `[WARNING] Shard ${shardId}: submitted ${submitted} commitments but blocks contain ${finalized} commitments`,
        );
      }

      validation.set(shardId, { finalized, match, submitted });
    }

    return validation;
  }

  private static buildReportFromStats(
    strategy: string,
    shardStats: Map<number, IShardRunningStats>,
    batches: IShardBatchResult[],
    errors: IShardOperationResult[],
    totalDurationMs: number,
    shardDurations: Map<number, number>,
    csvPath: string,
    blockRecords: IBlockRecord[] = [],
    blockCsvPath: string | null = null,
    commitmentValidation: Map<number, ICommitmentValidation> = new Map(),
  ): ILoadTestReport {
    const shardSummaries = new Map<number, IShardSummary>();
    for (const [shardId, stats] of shardStats) {
      const wallClock = shardDurations.get(shardId) ?? 0;
      shardSummaries.set(shardId, {
        avgCommitMs: stats.successes > 0 ? stats.commitSum / stats.successes : 0,
        avgPollCount: stats.successes > 0 ? stats.pollCountSum / stats.successes : 0,
        avgProofWaitMs: stats.successes > 0 ? stats.proofWaitSum / stats.successes : 0,
        avgTotalMs: stats.successes > 0 ? stats.totalSum / stats.successes : 0,
        maxTotalMs: stats.maxTotal === -Infinity ? 0 : stats.maxTotal,
        minTotalMs: stats.minTotal === Infinity ? 0 : stats.minTotal,
        opsPerSecond: wallClock > 0 ? (stats.totalOps / wallClock) * 1000 : 0,
        shardId,
        successRate: stats.totalOps > 0 ? (stats.successes / stats.totalOps) * 100 : 0,
        timeDistribution: ShardLoadRunner.histogramToDistribution(stats.histogram),
        totalDurationMs: wallClock,
        totalFailures: stats.failures,
        totalOperations: stats.totalOps,
        totalSuccesses: stats.successes,
      });
    }
    return {
      batches,
      blockCsvPath,
      blockRecords,
      commitmentValidation,
      csvPath,
      errors,
      shardSummaries,
      strategy,
      totalDurationMs,
    };
  }

  private static createEmptyStats(): IShardRunningStats {
    return {
      commitSum: 0,
      failures: 0,
      histogram: new Map(),
      maxTotal: -Infinity,
      minTotal: Infinity,
      pollCountSum: 0,
      proofWaitSum: 0,
      successes: 0,
      totalOps: 0,
      totalSum: 0,
    };
  }

  private static escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private static formatTimestamp(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}000`;
  }

  private static histogramToDistribution(histogram: Map<number, number>): ITimeBucket[] {
    const sortedKeys = [...histogram.keys()].sort((a, b) => a - b);
    return sortedKeys.map((bucketMs) => {
      const nextMs = bucketMs + TIME_BUCKET_STEP_MS;
      const labelSec = (bucketMs / 1000).toFixed(0);
      const nextSec = (nextMs / 1000).toFixed(0);
      return { bucketMs, count: histogram.get(bucketMs)!, label: `${labelSec}-${nextSec}s` };
    });
  }

  private static sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new Error('Proof wait timeout exceeded'));
        },
        { once: true },
      );
    });
  }

  private static updateStats(stats: IShardRunningStats, result: IShardOperationResult): void {
    stats.totalOps++;
    if (result.success) {
      stats.successes++;
      stats.commitSum += result.commitDurationMs;
      stats.pollCountSum += result.proofPollCount;
      stats.proofWaitSum += result.proofWaitDurationMs;
      stats.totalSum += result.totalDurationMs;
    } else {
      stats.failures++;
    }
    stats.minTotal = Math.min(stats.minTotal, result.totalDurationMs);
    stats.maxTotal = Math.max(stats.maxTotal, result.totalDurationMs);
    const bucket = Math.floor(result.totalDurationMs / TIME_BUCKET_STEP_MS) * TIME_BUCKET_STEP_MS;
    stats.histogram.set(bucket, (stats.histogram.get(bucket) ?? 0) + 1);
  }

  private static writeBlockCsv(blockRecords: IBlockRecord[], csvPath: string): void {
    const stream = createWriteStream(csvPath);
    stream.write(BLOCK_CSV_HEADER + '\n');
    for (const r of blockRecords) {
      stream.write(
        [
          r.shardId,
          r.blockNumber,
          r.commitments,
          r.createdAt,
          r.finalizationMs.toFixed(0),
          r.throughput.toFixed(2),
        ].join(',') + '\n',
      );
    }
    stream.end();
  }

  private static writeCsvRow(stream: WriteStream, r: IShardOperationResult): void {
    stream.write(
      [
        r.shardId,
        ShardLoadRunner.escapeCsv(r.stateId),
        r.success,
        r.failedPhase ?? '',
        ShardLoadRunner.escapeCsv(r.error ?? ''),
        r.commitDurationMs.toFixed(1),
        r.proofWaitDurationMs.toFixed(1),
        r.totalDurationMs.toFixed(1),
        r.proofPollCount,
        r.startedAt,
        r.endedAt,
      ].join(',') + '\n',
    );
  }

  public async destroyMintPool(): Promise<void> {
    if (this.mintPool) {
      await this.mintPool.destroy();
      this.mintPool = null;
    }
  }

  public async initMintPool(shardCount: number): Promise<void> {
    const defaultPath = new URL('../../../../tests/functional/trust-base.json', import.meta.url).pathname;
    const trustBasePath = process.env.TRUST_BASE_PATH ?? defaultPath;
    const poolSize = getMintPoolSize(shardCount);
    this.mintPool = await ShardLoadMintPool.create(poolSize, trustBasePath);
    console.log(`[ShardLoadRunner] Mint worker pool initialized: ${poolSize} threads`);
  }

  public async prepareOperations(
    opsPerShard: number,
    shardIdLength: number,
  ): Promise<Map<number, IPreparedOperation[]>> {
    const shardCount = 1 << shardIdLength;
    const baseId = 1 << shardIdLength;
    const buckets = new Map<number, IPreparedOperation[]>();

    for (let i = 0; i < shardCount; i++) {
      buckets.set(baseId + i, []);
    }

    const recipient = await this.getRecipientAddress();
    const maxAttempts = opsPerShard * shardCount * 5;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const allFull = [...buckets.values()].every((ops) => ops.length >= opsPerShard);
      if (allFull) {
        break;
      }

      attempts++;
      const tokenIdBytes = crypto.getRandomValues(new Uint8Array(32));
      const tokenTypeBytes = crypto.getRandomValues(new Uint8Array(32));

      // Create temporary transaction only to determine shard routing
      const mintTransaction = await MintTransaction.create(
        recipient,
        new TokenId(tokenIdBytes),
        new TokenType(tokenTypeBytes),
        CborSerializer.encodeArray(),
      );
      const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
      const stateId = await StateId.fromCertificationData(certificationData);
      const shardId = ShardAwareAggregatorClient.getShardForStateId(stateId, shardIdLength);

      const bucket = buckets.get(shardId)!;
      if (bucket.length < opsPerShard) {
        // Store only lightweight seeds, discard heavy transaction objects
        bucket.push({ shardId, tokenIdBytes, tokenTypeBytes });
      }

      if (attempts % 100_000 === 0) {
        const progress = [...buckets.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([id, ops]) => `${id}:${ops.length}`)
          .join(' ');
        console.log(`[ShardLoadRunner] Preparation progress: ${attempts} attempts | ${progress}`);
      }
    }

    // Trim to exact count
    for (const [shardId, ops] of buckets) {
      buckets.set(shardId, ops.slice(0, opsPerShard));
    }

    const counts = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, ops]) => `shard ${id}: ${ops.length}`)
      .join(', ');
    console.log(`[ShardLoadRunner] Prepared operations (${attempts} attempts): ${counts}`);

    return buckets;
  }

  public async runConstantPressure(
    preparedOps: Map<number, IPreparedOperation[]>,
    concurrency: number,
    csvPath: string,
  ): Promise<ILoadTestReport> {
    const csvStream = createWriteStream(csvPath);
    csvStream.write(CSV_HEADER + '\n');
    const shardStats = new Map<number, IShardRunningStats>();
    const errors: IShardOperationResult[] = [];
    const shardDurations = new Map<number, number>();
    const totalStart = performance.now();

    for (const shardId of preparedOps.keys()) {
      shardStats.set(shardId, ShardLoadRunner.createEmptyStats());
    }

    const monitor = this.createMonitor();
    if (monitor) {
      await monitor.start();
    }

    const shardPromises: Promise<{ durationMs: number; shardId: number }>[] = [];

    for (const [shardId, ops] of preparedOps) {
      shardPromises.push(
        (async (): Promise<{ durationMs: number; shardId: number }> => {
          const t = performance.now();
          await this.runWorkerPoolStreaming(ops, concurrency, (result) => {
            ShardLoadRunner.updateStats(shardStats.get(shardId)!, result);
            ShardLoadRunner.writeCsvRow(csvStream, result);
            if (!result.success) {
              errors.push(result);
            }
          });
          return { durationMs: performance.now() - t, shardId };
        })(),
      );
    }

    const shardResults = await Promise.all(shardPromises);
    for (const sr of shardResults) {
      shardDurations.set(sr.shardId, sr.durationMs);
    }

    await new Promise<void>((resolve) => csvStream.end(resolve));

    const { blockCsvPath, blockRecords, commitmentValidation } = await this.finishMonitor(monitor, shardStats, csvPath);
    const totalDurationMs = performance.now() - totalStart;
    return ShardLoadRunner.buildReportFromStats(
      'Constant Pressure',
      shardStats,
      [],
      errors,
      totalDurationMs,
      shardDurations,
      csvPath,
      blockRecords,
      blockCsvPath,
      commitmentValidation,
    );
  }

  public async runIndependentBatches(
    preparedOps: Map<number, IPreparedOperation[]>,
    batchSize: number,
    batchCount: number,
    csvPath: string,
  ): Promise<ILoadTestReport> {
    const csvStream = createWriteStream(csvPath);
    csvStream.write(CSV_HEADER + '\n');
    const shardStats = new Map<number, IShardRunningStats>();
    const allBatches: IShardBatchResult[] = [];
    const errors: IShardOperationResult[] = [];
    const shardDurations = new Map<number, number>();
    const totalStart = performance.now();

    for (const shardId of preparedOps.keys()) {
      shardStats.set(shardId, ShardLoadRunner.createEmptyStats());
    }

    const monitor = this.createMonitor();
    if (monitor) {
      await monitor.start();
    }

    const shardPromises: Promise<{ batches: IShardBatchResult[]; durationMs: number; shardId: number }>[] = [];

    for (const [shardId, ops] of preparedOps) {
      shardPromises.push(
        (async (): Promise<{ batches: IShardBatchResult[]; durationMs: number; shardId: number }> => {
          const t = performance.now();
          const shardBatches: IShardBatchResult[] = [];

          for (let batch = 0; batch < batchCount; batch++) {
            const startIdx = batch * batchSize;
            const batchOps = ops.slice(startIdx, startIdx + batchSize);
            if (batchOps.length === 0) {
              break;
            }

            const br = await this.runBatch(shardId, batch, batchOps);
            shardBatches.push(br);
            for (const result of br.results) {
              ShardLoadRunner.updateStats(shardStats.get(shardId)!, result);
              ShardLoadRunner.writeCsvRow(csvStream, result);
              if (!result.success) {
                errors.push(result);
              }
            }
          }

          return { batches: shardBatches, durationMs: performance.now() - t, shardId };
        })(),
      );
    }

    const shardResults = await Promise.all(shardPromises);
    for (const sr of shardResults) {
      allBatches.push(...sr.batches);
      shardDurations.set(sr.shardId, sr.durationMs);
    }

    await new Promise<void>((resolve) => csvStream.end(resolve));

    const { blockCsvPath, blockRecords, commitmentValidation } = await this.finishMonitor(monitor, shardStats, csvPath);
    const totalDurationMs = performance.now() - totalStart;
    return ShardLoadRunner.buildReportFromStats(
      'Independent Batches',
      shardStats,
      allBatches,
      errors,
      totalDurationMs,
      shardDurations,
      csvPath,
      blockRecords,
      blockCsvPath,
      commitmentValidation,
    );
  }

  public async runSynchronizedBatches(
    preparedOps: Map<number, IPreparedOperation[]>,
    batchSize: number,
    batchCount: number,
    csvPath: string,
  ): Promise<ILoadTestReport> {
    const csvStream = createWriteStream(csvPath);
    csvStream.write(CSV_HEADER + '\n');
    const shardStats = new Map<number, IShardRunningStats>();
    const allBatches: IShardBatchResult[] = [];
    const errors: IShardOperationResult[] = [];
    const shardDurations = new Map<number, number>();
    const totalStart = performance.now();

    for (const shardId of preparedOps.keys()) {
      shardStats.set(shardId, ShardLoadRunner.createEmptyStats());
    }

    const monitor = this.createMonitor();
    if (monitor) {
      await monitor.start();
    }

    for (let batch = 0; batch < batchCount; batch++) {
      const batchPromises: Promise<IShardBatchResult>[] = [];

      for (const [shardId, ops] of preparedOps) {
        const startIdx = batch * batchSize;
        const batchOps = ops.slice(startIdx, startIdx + batchSize);
        if (batchOps.length === 0) {
          continue;
        }

        batchPromises.push(this.runBatch(shardId, batch, batchOps));
      }

      const batchResults = await Promise.all(batchPromises);
      for (const br of batchResults) {
        allBatches.push(br);
        for (const result of br.results) {
          ShardLoadRunner.updateStats(shardStats.get(br.shardId)!, result);
          ShardLoadRunner.writeCsvRow(csvStream, result);
          if (!result.success) {
            errors.push(result);
          }
        }
      }
    }

    await new Promise<void>((resolve) => csvStream.end(resolve));

    const { blockCsvPath, blockRecords, commitmentValidation } = await this.finishMonitor(monitor, shardStats, csvPath);
    const totalDurationMs = performance.now() - totalStart;
    for (const shardId of preparedOps.keys()) {
      shardDurations.set(shardId, totalDurationMs);
    }
    return ShardLoadRunner.buildReportFromStats(
      'Synchronized Batches',
      shardStats,
      allBatches,
      errors,
      totalDurationMs,
      shardDurations,
      csvPath,
      blockRecords,
      blockCsvPath,
      commitmentValidation,
    );
  }

  private createMonitor(): ShardBlockMonitor | null {
    if (!this.shardUrls) {
      return null;
    }
    return new ShardBlockMonitor(this.shardUrls);
  }

  private async executeOperation(op: IPreparedOperation): Promise<IShardOperationResult> {
    const startedAt = ShardLoadRunner.formatTimestamp(new Date());
    const totalStart = performance.now();
    let commitDurationMs = 0;
    let failedPhase: string | null = null;
    let proofWaitDurationMs = 0;
    let proofPollCount = 0;
    let stateId = '';

    try {
      // Recreate MintTransaction from seeds
      failedPhase = 'transaction-creation';
      const recipient = await this.getRecipientAddress();
      const mintTransaction = await MintTransaction.create(
        recipient,
        new TokenId(op.tokenIdBytes),
        new TokenType(op.tokenTypeBytes),
        CborSerializer.encodeArray(),
      );
      const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
      const stateIdObj = await StateId.fromCertificationData(certificationData);
      stateId = stateIdObj.toString();

      // Phase 1 - Certification Submit
      failedPhase = 'certification-submit';
      const t1 = performance.now();
      const response = await this.setup.client.submitCertificationRequest(certificationData);
      commitDurationMs = performance.now() - t1;

      if (response.status !== CertificationStatus.SUCCESS) {
        throw new Error(`Certification failed: ${response.status}`);
      }

      // Phase 2 - Inclusion Proof Wait
      failedPhase = 'inclusion-proof-wait';
      const t2 = performance.now();
      const proofResult = await this.waitInclusionProofWithStats(mintTransaction);
      proofWaitDurationMs = performance.now() - t2;
      proofPollCount = proofResult.pollCount;

      // Phase 3 - Token Creation (offloaded to worker thread pool when available)
      failedPhase = 'token-creation';
      if (this.mintPool) {
        await this.mintPool.mint(mintTransaction.toCBOR(), proofResult.proof.toCBOR());
      } else {
        await Token.mint(
          this.setup.trustBase,
          this.setup.predicateVerifier,
          await mintTransaction.toCertifiedTransaction(
            this.setup.trustBase,
            this.setup.predicateVerifier,
            proofResult.proof,
          ),
        );
      }

      return {
        commitDurationMs,
        endedAt: ShardLoadRunner.formatTimestamp(new Date()),
        error: null,
        failedPhase: null,
        proofPollCount,
        proofWaitDurationMs,
        shardId: op.shardId,
        startedAt,
        stateId,
        success: true,
        totalDurationMs: performance.now() - totalStart,
      };
    } catch (e) {
      return {
        commitDurationMs,
        endedAt: ShardLoadRunner.formatTimestamp(new Date()),
        error: (e as Error).message,
        failedPhase,
        proofPollCount,
        proofWaitDurationMs,
        shardId: op.shardId,
        startedAt,
        stateId,
        success: false,
        totalDurationMs: performance.now() - totalStart,
      };
    }
  }

  private async finishMonitor(
    monitor: ShardBlockMonitor | null,
    shardStats: Map<number, IShardRunningStats>,
    csvPath: string,
  ): Promise<{
    blockCsvPath: string | null;
    blockRecords: IBlockRecord[];
    commitmentValidation: Map<number, ICommitmentValidation>;
  }> {
    if (!monitor) {
      return { blockCsvPath: null, blockRecords: [], commitmentValidation: new Map() };
    }

    await monitor.waitForDrain();
    const blockRecords = await monitor.stop();
    const commitmentValidation = ShardLoadRunner.buildCommitmentValidation(shardStats, monitor);
    const blockCsvPath = csvPath.replace('.csv', '-blocks.csv');
    ShardLoadRunner.writeBlockCsv(blockRecords, blockCsvPath);

    return { blockCsvPath, blockRecords, commitmentValidation };
  }

  private async getRecipientAddress(): Promise<Address> {
    if (!this.cachedAddress) {
      this.cachedAddress = await Address.fromPredicate(this.user.predicate);
    }
    return this.cachedAddress;
  }

  private async runBatch(shardId: number, batchIndex: number, ops: IPreparedOperation[]): Promise<IShardBatchResult> {
    const startedAt = ShardLoadRunner.formatTimestamp(new Date());
    const batchStart = performance.now();
    const results = await Promise.all(ops.map((op) => this.executeOperation(op)));
    const durationMs = performance.now() - batchStart;
    const endedAt = ShardLoadRunner.formatTimestamp(new Date());

    return { batchIndex, durationMs, endedAt, results, shardId, startedAt };
  }

  private async runWorkerPoolStreaming(
    ops: IPreparedOperation[],
    concurrency: number,
    onResult: (result: IShardOperationResult) => void,
  ): Promise<void> {
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < ops.length) {
        const idx = nextIndex++;
        if (idx >= ops.length) {
          break;
        }
        const result = await this.executeOperation(ops[idx]);
        onResult(result);
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, ops.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  private async waitInclusionProofWithStats(
    transaction: MintTransaction,
  ): Promise<{ pollCount: number; proof: InclusionProof }> {
    const stateId = await StateId.fromTransaction(transaction);
    const signal = AbortSignal.timeout(PROOF_WAIT_TIMEOUT_MS);
    let pollCount = 0;

    while (true) {
      pollCount++;
      try {
        const inclusionProof = await this.setup.client
          .getInclusionProof(stateId)
          .then((response) => response.inclusionProof);

        const verificationStatus = await InclusionProofVerificationRule.verify(
          this.setup.trustBase,
          this.setup.predicateVerifier,
          inclusionProof,
          transaction,
        );

        switch (verificationStatus.status) {
          case InclusionProofVerificationStatus.OK:
            return { pollCount, proof: inclusionProof };
          case InclusionProofVerificationStatus.PATH_NOT_INCLUDED:
            break;
          default:
            throw new Error(`Invalid inclusion proof status: ${verificationStatus.status}`);
        }
      } catch (err) {
        if (!(err instanceof JsonRpcNetworkError && err.status === 404)) {
          throw err;
        }
      }

      await ShardLoadRunner.sleep(PROOF_POLL_INTERVAL_MS, signal);
    }
  }
}
