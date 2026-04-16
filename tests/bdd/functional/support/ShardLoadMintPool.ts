import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'url';

interface IMintJob {
  readonly id: number;
  readonly inclusionProofCbor: Uint8Array;
  readonly mintTransactionCbor: Uint8Array;
  readonly reject: (reason: Error) => void;
  readonly resolve: (value: void) => void;
}

interface IWorkerState {
  busy: boolean;
  readonly worker: Worker;
}

const WORKER_PATH = fileURLToPath(new URL('./ShardLoadMintWorker.ts', import.meta.url));

export class ShardLoadMintPool {
  private nextId = 0;
  private readonly pending = new Map<number, IMintJob>();
  private readonly queue: IMintJob[] = [];
  private readonly workers: IWorkerState[] = [];

  private constructor(private readonly poolSize: number) {}

  public static async create(poolSize: number, trustBasePath: string): Promise<ShardLoadMintPool> {
    const pool = new ShardLoadMintPool(poolSize);
    await pool.init(trustBasePath);
    return pool;
  }

  public async destroy(): Promise<void> {
    await Promise.all(this.workers.map((ws) => ws.worker.terminate()));
    this.workers.length = 0;
  }

  public mint(mintTransactionCbor: Uint8Array, inclusionProofCbor: Uint8Array): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const job: IMintJob = {
        id: this.nextId++,
        inclusionProofCbor,
        mintTransactionCbor,
        reject,
        resolve,
      };
      this.queue.push(job);
      this.dispatch();
    });
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      const available = this.workers.find((ws) => !ws.busy);
      if (!available) {
        return;
      }
      const job = this.queue.shift()!;
      available.busy = true;
      this.pending.set(job.id, job);
      available.worker.postMessage({
        id: job.id,
        inclusionProofCbor: job.inclusionProofCbor,
        mintTransactionCbor: job.mintTransactionCbor,
        type: 'mint',
      });
    }
  }

  private async init(trustBasePath: string): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      // Loaders aren't inherited by worker_threads automatically — we must
      // re-register tsx in the worker so .ts resolution and .js → .ts rewriting
      // work for imports from src/.
      const worker = new Worker(WORKER_PATH, { execArgv: ['--import', 'tsx/esm'] });

      const ws: IWorkerState = { busy: false, worker };
      this.workers.push(ws);

      worker.on('message', (msg: { error?: string; id?: number; success?: boolean; type: string }) => {
        if (msg.type === 'mint-result') {
          const job = this.pending.get(msg.id!);
          if (job) {
            this.pending.delete(msg.id!);
            ws.busy = false;
            if (msg.success) {
              job.resolve();
            } else {
              job.reject(new Error(msg.error ?? 'Worker mint failed'));
            }
            this.dispatch();
          }
        }
      });

      worker.on('error', (err) => {
        console.error(`[MintPool] Worker error:`, err);
      });

      initPromises.push(
        new Promise<void>((resolve, reject) => {
          const handler = (msg: { error?: string; type: string }): void => {
            if (msg.type === 'init-ok') {
              worker.off('message', handler);
              resolve();
            } else if (msg.type === 'init-error') {
              worker.off('message', handler);
              reject(new Error(msg.error));
            }
          };
          worker.on('message', handler);
          worker.postMessage({ trustBasePath, type: 'init' });
        }),
      );
    }

    await Promise.all(initPromises);
  }
}
