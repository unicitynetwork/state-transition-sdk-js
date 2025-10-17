import { RootTrustBase, RootTrustBaseNodeInfo } from '../../../src/bft/RootTrustBase.js';

export function createRootTrustBase(publicKey: Uint8Array): RootTrustBase {
  return new RootTrustBase(
    0n,
    0,
    0n,
    0n,
    [new RootTrustBaseNodeInfo('NODE', publicKey, 1n)],
    1n,
    new Uint8Array(0),
    new Uint8Array(0),
    null,
    new Map(),
  );
}
