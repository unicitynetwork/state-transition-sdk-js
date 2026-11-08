import { readFileSync } from 'node:fs';

import { ITrustBaseHistory } from '../../src/api/bft/trustbase/ITrustBaseHistory.js';
import { RootTrustBaseV2 } from '../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../src/api/bft/trustbase/TrustBaseBundle.js';
import { TrustBaseHistory } from '../../src/api/bft/trustbase/TrustBaseHistory.js';
import { TrustBaseSession } from '../../src/api/bft/trustbase/TrustBaseSession.js';
import { MemoryTrustBaseStore } from '../../src/api/bft/trustbase/TrustBaseStore.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { HexConverter } from '../../src/util/HexConverter.js';

/** Budget for a test deployment's bundle file. */
const LIMITS = { maxBytes: 1 << 20, maxEntries: 1024 };

/**
 * The trust-base history of a deployment under test, from a trust-base bundle file (tag 39015, one-entry for a fresh network) and the genesis
 * entry id the test pins. Built synchronously so a suite can use it at describe level: `history` is filled when `ready` settles, so wait for
 * `ready` (for example in `beforeAll`) before verifying.
 *
 * @param {string} path Bundle file.
 * @param {string} genesisPinHex Genesis entry id, hex.
 * @returns {object} The history and the promise that settles when it holds the bundle.
 */
export function loadTrustBaseHistorySync(
  path: string,
  genesisPinHex: string,
): { history: TrustBaseHistory; ready: Promise<void> } {
  const pin = HexConverter.decode(genesisPinHex);
  const history = TrustBaseHistory.create(pin);
  const ready = TrustBaseBundle.decode(new Uint8Array(readFileSync(path)), LIMITS).then(async (bundle) => {
    for (const entry of bundle.entries) {
      await history.append(entry);
    }
  });
  return { history, ready };
}

/**
 * @param {string} name Environment variable.
 * @returns {string} Its value.
 * @throws {Error} If it is unset.
 */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is unset (a trust-base bundle file and its genesis entry id are needed).`);
  }
  return value;
}

/**
 * A history that is filled once a local-network session has opened: the suites take their history synchronously, at describe level, and wait for
 * `ready` before they verify against it.
 */
class OpenedHistory implements ITrustBaseHistory {
  private inner: ITrustBaseHistory | null = null;

  public get entries(): RootTrustBaseV2[] {
    return this.opened().entries;
  }

  public get genesisPin(): Uint8Array {
    return this.opened().genesisPin;
  }

  public get isEmpty(): boolean {
    return this.opened().isEmpty;
  }

  public get networkId(): NetworkId | null {
    return this.opened().networkId;
  }

  public get tip(): RootTrustBaseV2 | null {
    return this.opened().tip;
  }

  public entryForEpoch(epoch: bigint): RootTrustBaseV2 | null {
    return this.opened().entryForEpoch(epoch);
  }

  public epochEndRound(epoch: bigint): bigint | null {
    return this.opened().epochEndRound(epoch);
  }

  public open(history: ITrustBaseHistory): void {
    this.inner = history;
  }

  private opened(): ITrustBaseHistory {
    if (this.inner === null) {
      throw new Error('The local-network session is not open yet: wait for `ready` before verifying.');
    }
    return this.inner;
  }
}

/**
 * The history of a local deployment under test, from the trust-base bundle its aggregator served: the pin is derived from the bundle by
 * `TrustBaseSession.openLocal` (the deployment is trusted because the suite started it), which verifies every entry strictly. `history` is filled when
 * `ready` settles.
 *
 * @param {string} path Bundle file (the aggregator's GET /api/v1/trustbases answer from the genesis epoch).
 * @param {string} [expectedGenesisId] The genesis entry id the deployment's genesis step wrote (hex, `0x` optional); a different derived id fails `ready`.
 * @returns {object} The history and the promise that settles when the session has opened.
 */
export function openLocalHistorySync(
  path: string,
  expectedGenesisId?: string,
): { history: ITrustBaseHistory; ready: Promise<void> } {
  const history = new OpenedHistory();
  const ready = TrustBaseSession.openLocal(new Uint8Array(readFileSync(path)), new MemoryTrustBaseStore()).then(
    ({ session }) => {
      if (
        expectedGenesisId !== undefined &&
        HexConverter.encode(session.history.genesisPin) !== expectedGenesisId.replace(/^0x/, '')
      ) {
        throw new Error('The genesis id derived from the served bundle differs from the one the genesis step wrote.');
      }
      history.open(session.history);
    },
  );
  return { history, ready };
}
