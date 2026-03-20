import { IBlockRecord } from './ShardLoadTypes.js';
import { JsonRpcHttpTransport } from '../../../../src/api/json-rpc/JsonRpcHttpTransport.js';

const DRAIN_TIMEOUT_MS = 60_000;

interface IGetBlockResponse {
  block: {
    createdAt: number | string;
  };
  totalCommitments: number | string;
}

export class ShardBlockMonitor {
  private readonly blockRecords: IBlockRecord[] = [];
  private readonly intervals: Map<number, ReturnType<typeof setInterval>> = new Map();
  private readonly lastBlockNumber: Map<number, number> = new Map();
  private readonly lastCreatedAtMs: Map<number, number> = new Map();
  private readonly pollIntervalMs: number;
  private readonly seenBlocks: Set<string> = new Set();
  private readonly shardUrls: Map<number, string>;
  private readonly startBlockNumber: Map<number, number> = new Map();
  private readonly transports: Map<number, JsonRpcHttpTransport> = new Map();

  public constructor(shardUrls: Map<number, string>, pollIntervalMs: number = 500) {
    this.shardUrls = shardUrls;
    this.pollIntervalMs = pollIntervalMs;

    for (const [shardId, url] of shardUrls) {
      this.transports.set(shardId, new JsonRpcHttpTransport(url));
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public getTotalCommitments(): Map<number, number> {
    const totals = new Map<number, number>();
    for (const record of this.blockRecords) {
      totals.set(record.shardId, (totals.get(record.shardId) ?? 0) + record.commitments);
    }
    return totals;
  }

  public async start(): Promise<void> {
    for (const [shardId, transport] of this.transports) {
      const height = await this.getBlockHeight(transport);
      this.startBlockNumber.set(shardId, height);
      this.lastBlockNumber.set(shardId, height);

      const interval = setInterval(() => {
        void this.pollShard(shardId);
      }, this.pollIntervalMs);
      this.intervals.set(shardId, interval);
    }
  }

  public async stop(): Promise<IBlockRecord[]> {
    this.stopIntervals();

    // Final poll to capture any remaining blocks
    for (const shardId of this.transports.keys()) {
      await this.pollShard(shardId);
    }

    return [...this.blockRecords].sort((a, b) => a.shardId - b.shardId || a.blockNumber - b.blockNumber);
  }

  public async waitForDrain(): Promise<void> {
    // Stop background polling — we take over polling here
    this.stopIntervals();

    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    const drained = new Set<number>();

    while (drained.size < this.shardUrls.size) {
      if (Date.now() > deadline) {
        const remaining = [...this.shardUrls.keys()].filter((id) => !drained.has(id));
        console.log(
          `[ShardBlockMonitor] Drain timeout after ${DRAIN_TIMEOUT_MS}ms. Shards not drained: ${remaining.join(', ')}`,
        );
        break;
      }

      for (const [shardId, transport] of this.transports) {
        if (drained.has(shardId)) {
          continue;
        }

        const height = await this.getBlockHeight(transport);
        const lastPolled = this.lastBlockNumber.get(shardId) ?? height;

        for (let bn = lastPolled + 1; bn <= height; bn++) {
          const record = await this.fetchBlock(shardId, transport, bn);
          if (record) {
            if (record.commitments === 0) {
              drained.add(shardId);
            }
          }
        }
        this.lastBlockNumber.set(shardId, height);
      }

      if (drained.size < this.shardUrls.size) {
        await ShardBlockMonitor.sleep(this.pollIntervalMs);
      }
    }
  }

  private addRecord(record: IBlockRecord): void {
    const key = `${record.shardId}:${record.blockNumber}`;
    if (this.seenBlocks.has(key)) {
      return;
    }
    this.seenBlocks.add(key);
    this.blockRecords.push(record);
  }

  private async fetchBlock(
    shardId: number,
    transport: JsonRpcHttpTransport,
    blockNumber: number,
  ): Promise<IBlockRecord | null> {
    try {
      const response = (await transport.request('get_block', { blockNumber })) as IGetBlockResponse;
      const commitments = Number(response.totalCommitments);
      const createdAtMs = Number(response.block.createdAt);
      const prevCreatedAtMs = this.lastCreatedAtMs.get(shardId) ?? createdAtMs;
      const finalizationMs = createdAtMs - prevCreatedAtMs;
      const throughput = finalizationMs > 0 ? (commitments / finalizationMs) * 1000 : 0;

      this.lastCreatedAtMs.set(shardId, createdAtMs);

      if (commitments === 0) {
        return { blockNumber, commitments, createdAt: '', createdAtMs, finalizationMs: 0, shardId, throughput: 0 };
      }

      const record: IBlockRecord = {
        blockNumber,
        commitments,
        createdAt: String(response.block.createdAt),
        createdAtMs,
        finalizationMs,
        shardId,
        throughput,
      };
      this.addRecord(record);
      return record;
    } catch (e) {
      console.log(
        `[ShardBlockMonitor] Error fetching block ${blockNumber} from shard ${shardId}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  private async getBlockHeight(transport: JsonRpcHttpTransport): Promise<number> {
    const response = (await transport.request('get_block_height', {})) as { blockNumber: number | string };
    return Number(response.blockNumber);
  }

  private async pollShard(shardId: number): Promise<void> {
    const transport = this.transports.get(shardId);
    if (!transport) {
      return;
    }

    try {
      const height = await this.getBlockHeight(transport);
      const lastPolled = this.lastBlockNumber.get(shardId) ?? height;

      for (let bn = lastPolled + 1; bn <= height; bn++) {
        await this.fetchBlock(shardId, transport, bn);
      }
      this.lastBlockNumber.set(shardId, height);
    } catch {
      // Silently ignore poll errors — transient network issues are expected
    }
  }

  private stopIntervals(): void {
    for (const [, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}
