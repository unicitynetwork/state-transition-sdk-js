import {
  IBlockRecord,
  ICommitmentValidation,
  ILoadTestReport,
  IShardBatchResult,
  IShardOperationResult,
  IShardSummary,
} from './ShardLoadTypes.js';

export class ShardLoadReporter {
  public static printReport(report: ILoadTestReport): void {
    const line = '='.repeat(60);
    console.log(`\n${line}`);
    console.log(`=== Shard Load Test Report: ${report.strategy} ===`);
    console.log(`Shards: ${report.shardSummaries.size} | Total duration: ${report.totalDurationMs.toFixed(0)}ms`);
    console.log(`CSV: ${report.csvPath}`);
    if (report.blockCsvPath) {
      console.log(`Block CSV: ${report.blockCsvPath}`);
    }
    console.log(line);

    ShardLoadReporter.printShardSummaryTable(report.shardSummaries);
    ShardLoadReporter.printTimeDistribution(report.shardSummaries);

    if (report.batches.length > 0) {
      ShardLoadReporter.printBatchBreakdown(report.batches);
    }

    if (report.blockRecords.length > 0) {
      ShardLoadReporter.printBlockFinalization(report.blockRecords);
    }

    if (report.commitmentValidation.size > 0) {
      ShardLoadReporter.printCommitmentValidation(report.commitmentValidation);
    }

    ShardLoadReporter.printErrors(report.errors);
    ShardLoadReporter.printFastestSlowest(report.shardSummaries);
    console.log(line);
  }

  private static padColumns(values: string[], widths: number[]): string {
    return values.map((v, i) => v.padEnd(widths[i] ?? 10)).join(' | ');
  }

  private static printBatchBreakdown(batches: IShardBatchResult[]): void {
    console.log('\nPer-Batch Breakdown:');
    const widths = [7, 7, 18, 18, 10, 5, 6, 12, 11];
    const header = ShardLoadReporter.padColumns(
      ['Batch', 'Shard', 'Started', 'Ended', 'Duration', 'OK', 'Fail', 'Avg Commit', 'Avg Proof'],
      widths,
    );
    console.log(header);
    console.log('-'.repeat(header.length));

    const sorted = [...batches].sort((a, b) => a.batchIndex - b.batchIndex || a.shardId - b.shardId);
    for (const batch of sorted) {
      const successes = batch.results.filter((r) => r.success);
      const failures = batch.results.filter((r) => !r.success);
      const avgCommit =
        successes.length > 0 ? successes.reduce((sum, r) => sum + r.commitDurationMs, 0) / successes.length : 0;
      const avgProof =
        successes.length > 0 ? successes.reduce((sum, r) => sum + r.proofWaitDurationMs, 0) / successes.length : 0;

      console.log(
        ShardLoadReporter.padColumns(
          [
            String(batch.batchIndex),
            String(batch.shardId),
            batch.startedAt,
            batch.endedAt,
            `${batch.durationMs.toFixed(0)}ms`,
            String(successes.length),
            String(failures.length),
            `${avgCommit.toFixed(0)}ms`,
            `${avgProof.toFixed(0)}ms`,
          ],
          widths,
        ),
      );
    }
  }

  private static printBlockFinalization(blockRecords: IBlockRecord[]): void {
    const byShard = new Map<number, IBlockRecord[]>();
    for (const r of blockRecords) {
      const list = byShard.get(r.shardId) ?? [];
      list.push(r);
      byShard.set(r.shardId, list);
    }

    const widths = [7, 13, 20, 9, 12];
    for (const [shardId, records] of [...byShard.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`\nBlock Finalization (Shard ${shardId}):`);
      const header = ShardLoadReporter.padColumns(['Block', 'Commitments', 'CreatedAt', 'Delta', 'Throughput'], widths);
      console.log(header);
      console.log('-'.repeat(header.length));

      const sorted = [...records].sort((a, b) => a.blockNumber - b.blockNumber);
      for (const r of sorted) {
        const date = new Date(r.createdAtMs);
        const createdAtShort = isNaN(date.getTime()) ? r.createdAt : date.toISOString().slice(11, 23);
        console.log(
          ShardLoadReporter.padColumns(
            [
              String(r.blockNumber),
              String(r.commitments),
              createdAtShort,
              `${r.finalizationMs.toFixed(0)}ms`,
              `${r.throughput.toFixed(1)}/s`,
            ],
            widths,
          ),
        );
      }
    }
  }

  private static printCommitmentValidation(validation: Map<number, ICommitmentValidation>): void {
    console.log('\nCommitment Validation:');
    const widths = [7, 11, 11, 7];
    const header = ShardLoadReporter.padColumns(['Shard', 'Submitted', 'Finalized', 'Match'], widths);
    console.log(header);
    console.log('-'.repeat(header.length));

    const sorted = [...validation.entries()].sort((a, b) => a[0] - b[0]);
    for (const [shardId, v] of sorted) {
      console.log(
        ShardLoadReporter.padColumns(
          [String(shardId), String(v.submitted), String(v.finalized), v.match ? 'OK' : 'MISMATCH'],
          widths,
        ),
      );
    }
  }

  private static printErrors(errors: IShardOperationResult[]): void {
    if (errors.length === 0) {
      return;
    }

    console.log(`\nFailed Operations (${errors.length}):`);
    const widths = [7, 50, 22, 18, 18];
    const header = ShardLoadReporter.padColumns(['Shard', 'StateId', 'Failed Phase', 'Started', 'Error'], widths);
    console.log(header);
    console.log('-'.repeat(header.length));

    for (const f of errors) {
      console.log(
        ShardLoadReporter.padColumns(
          [String(f.shardId), f.stateId, f.failedPhase ?? 'unknown', f.startedAt, f.error ?? 'unknown'],
          widths,
        ),
      );
    }
  }

  private static printFastestSlowest(summaries: Map<number, IShardSummary>): void {
    const sorted = [...summaries.values()].sort((a, b) => a.totalDurationMs - b.totalDurationMs);
    if (sorted.length < 2) {
      return;
    }
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    console.log(
      `\nFastest: shard ${fastest.shardId} (${fastest.totalDurationMs.toFixed(0)}ms) | ` +
        `Slowest: shard ${slowest.shardId} (${slowest.totalDurationMs.toFixed(0)}ms)`,
    );
  }

  private static printShardSummaryTable(summaries: Map<number, IShardSummary>): void {
    console.log('\nPer-Shard Summary:');
    const widths = [7, 5, 5, 6, 10, 12, 11, 11, 8, 8, 9, 7];
    const header = ShardLoadReporter.padColumns(
      [
        'Shard',
        'Ops',
        'OK',
        'Fail',
        'Success%',
        'Avg Commit',
        'Avg Proof',
        'Avg Total',
        'Min',
        'Max',
        'Total',
        'Ops/s',
      ],
      widths,
    );
    console.log(header);
    console.log('-'.repeat(header.length));

    const sorted = [...summaries.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, summary] of sorted) {
      console.log(
        ShardLoadReporter.padColumns(
          [
            String(summary.shardId),
            String(summary.totalOperations),
            String(summary.totalSuccesses),
            String(summary.totalFailures),
            `${summary.successRate.toFixed(2)}%`,
            `${summary.avgCommitMs.toFixed(0)}ms`,
            `${summary.avgProofWaitMs.toFixed(0)}ms`,
            `${summary.avgTotalMs.toFixed(0)}ms`,
            `${summary.minTotalMs.toFixed(0)}ms`,
            `${summary.maxTotalMs.toFixed(0)}ms`,
            `${summary.totalDurationMs.toFixed(0)}ms`,
            summary.opsPerSecond.toFixed(2),
          ],
          widths,
        ),
      );
    }
  }

  private static printTimeDistribution(summaries: Map<number, IShardSummary>): void {
    const allBucketLabels = new Set<string>();
    for (const [, summary] of summaries) {
      for (const bucket of summary.timeDistribution) {
        allBucketLabels.add(bucket.label);
      }
    }

    if (allBucketLabels.size === 0) {
      return;
    }

    const sortedLabels = [...allBucketLabels].sort((a, b) => {
      const aMs = parseInt(a.split('-')[0], 10);
      const bMs = parseInt(b.split('-')[0], 10);
      return aMs - bMs;
    });

    console.log('\nTime Distribution (1s buckets):');
    const widths = [7, ...sortedLabels.map(() => 8)];
    const header = ShardLoadReporter.padColumns(['Shard', ...sortedLabels], widths);
    console.log(header);
    console.log('-'.repeat(header.length));

    const sorted = [...summaries.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, summary] of sorted) {
      const bucketMap = new Map(summary.timeDistribution.map((b) => [b.label, b.count]));
      console.log(
        ShardLoadReporter.padColumns(
          [String(summary.shardId), ...sortedLabels.map((label) => String(bucketMap.get(label) ?? 0))],
          widths,
        ),
      );
    }
  }
}
