export interface IPreparedOperation {
  readonly shardId: number;
  readonly tokenIdBytes: Uint8Array;
  readonly tokenTypeBytes: Uint8Array;
}

export interface IShardOperationResult {
  readonly commitDurationMs: number;
  readonly endedAt: string;
  readonly error: string | null;
  readonly failedPhase: string | null;
  readonly proofPollCount: number;
  readonly proofWaitDurationMs: number;
  readonly shardId: number;
  readonly startedAt: string;
  readonly stateId: string;
  readonly success: boolean;
  readonly totalDurationMs: number;
}

export interface IShardBatchResult {
  readonly batchIndex: number;
  readonly durationMs: number;
  readonly endedAt: string;
  readonly results: IShardOperationResult[];
  readonly shardId: number;
  readonly startedAt: string;
}

export interface ITimeBucket {
  readonly bucketMs: number;
  readonly count: number;
  readonly label: string;
}

export interface IShardSummary {
  readonly avgCommitMs: number;
  readonly avgPollCount: number;
  readonly avgProofWaitMs: number;
  readonly avgTotalMs: number;
  readonly maxTotalMs: number;
  readonly minTotalMs: number;
  readonly opsPerSecond: number;
  readonly shardId: number;
  readonly successRate: number;
  readonly timeDistribution: ITimeBucket[];
  readonly totalDurationMs: number;
  readonly totalFailures: number;
  readonly totalOperations: number;
  readonly totalSuccesses: number;
}

export interface IBlockRecord {
  readonly blockNumber: number;
  readonly commitments: number;
  readonly createdAt: string;
  readonly createdAtMs: number;
  readonly finalizationMs: number;
  readonly shardId: number;
  readonly throughput: number;
}

export interface ICommitmentValidation {
  readonly finalized: number;
  readonly match: boolean;
  readonly submitted: number;
}

export interface ILoadTestReport {
  readonly batches: IShardBatchResult[];
  readonly blockCsvPath: string | null;
  readonly blockRecords: IBlockRecord[];
  readonly commitmentValidation: Map<number, ICommitmentValidation>;
  readonly csvPath: string;
  readonly errors: IShardOperationResult[];
  readonly shardSummaries: Map<number, IShardSummary>;
  readonly strategy: string;
  readonly totalDurationMs: number;
}
