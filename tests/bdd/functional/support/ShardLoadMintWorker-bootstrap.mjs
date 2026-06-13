// PR #110 perf-test fix: Node's `--import tsx/esm` execArgv flag is not reliably honored
// inside worker_threads (the .js → .ts rewriting hook never installs, causing the worker to
// fail with `Cannot find module .../RootTrustBase.js`). This .mjs bootstrap registers tsx's
// loader hook explicitly via tsx's own `tsx/esm/api#register()` (the only API tsx 4.x accepts;
// `node:module#register('tsx/esm')` is rejected as legacy --loader mode).
import { register } from 'tsx/esm/api';

register();

await import('./ShardLoadMintWorker.ts');
