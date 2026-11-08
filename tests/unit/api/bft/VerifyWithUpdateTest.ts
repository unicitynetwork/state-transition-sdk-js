import {
  buildBundle,
  IBundleFields,
  loadVectors,
  parseBundleFields,
  rangeFields,
} from './trustbase/TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseUpdateError } from '../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseHistory } from '../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealTrustBaseEntryRule } from '../../../../src/api/bft/verification/rule/UnicitySealTrustBaseEntryRule.js';
import { NoTrustBaseEntryResult } from '../../../../src/api/bft/verification/TrustBaseEntryResult.js';
import { verifyWithUpdate } from '../../../../src/api/bft/verification/verifyWithUpdate.js';
import { ITrustBaseRequest, ITrustBaseSource } from '../../../../src/api/ITrustBaseSource.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

class Counting implements ITrustBaseSource {
  public readonly requests: ITrustBaseRequest[] = [];

  public constructor(private readonly bytes: Uint8Array) {}

  public getTrustBasePage(request: ITrustBaseRequest): Promise<Uint8Array> {
    this.requests.push(request);
    return Promise.resolve(this.bytes);
  }
}

const FAST = { backoffMs: 0, rounds: 1 };

async function atGenesis(): Promise<TrustBaseHistory> {
  const vector = loadVectors().bundles.find((candidate) => candidate.name.startsWith('three'));
  const fields: IBundleFields = parseBundleFields(HexConverter.decode(vector?.hex ?? ''));
  const genesis = RootTrustBaseV2.decode(fields.entries[0]);
  const history = TrustBaseHistory.create(await genesis.entryId());
  await history.append(genesis);
  return history;
}

/** Verification of a seal of epoch 2 against the history: the entry rule only, which is what decides "no entry". */
const verifySeal =
  (history: TrustBaseHistory, epoch: bigint, network = NetworkId.fromId(5)) =>
  async (): Promise<VerificationResult<VerificationStatus>> => {
    const seal = await UnicitySeal.create(network, 10_000_000n, epoch, 0n, null, new Uint8Array(32), new Map());
    const placed = UnicitySealTrustBaseEntryRule.verify(history, seal);
    return new VerificationResult('Test', placed.status, '', [placed]);
  };

describe('verifyWithUpdate', () => {
  it('returns an OK result without touching the sources', async () => {
    const history = await atGenesis();
    const source = new Counting(buildBundle(rangeFields()));
    const result = await verifyWithUpdate(history, [source], verifySeal(history, 1n), FAST);
    expect(result.status).toBe(VerificationStatus.OK);
    expect(source.requests).toHaveLength(0);
  });

  it('on the typed no-entry failure updates once and verifies again', async () => {
    const history = await atGenesis();
    const source = new Counting(buildBundle(rangeFields()));
    let calls = 0;
    const verify = verifySeal(history, 3n);
    const result = await verifyWithUpdate(
      history,
      [source],
      () => {
        calls++;
        return verify();
      },
      FAST,
    );
    expect(result.status).toBe(VerificationStatus.OK);
    expect(source.requests).toHaveLength(1);
    expect(calls).toBe(2);
  });

  describe('when a later page fails', () => {
    // Page 1 serves epoch 2 and announces the end 3; the next request fails.
    const failingAfterFirstPage = (): { calls: () => number; source: ITrustBaseSource } => {
      let calls = 0;
      const f = rangeFields();
      const source: ITrustBaseSource = {
        getTrustBasePage: (): Promise<Uint8Array> => {
          calls++;
          return calls > 1
            ? Promise.reject(new Error('gone'))
            : Promise.resolve(buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n }));
        },
      };
      return { calls: () => calls, source };
    };

    it('verifies again when the needed entry arrived before the failure', async () => {
      const history = await atGenesis();
      const { source } = failingAfterFirstPage();
      const result = await verifyWithUpdate(history, [source], verifySeal(history, 2n), FAST);
      expect(result.status).toBe(VerificationStatus.OK);
      expect(history.tip?.epoch).toBe(2n);
    });

    it('still throws when the needed entry is not among those that arrived', async () => {
      const history = await atGenesis();
      const { source } = failingAfterFirstPage();
      const error: unknown = await verifyWithUpdate(history, [source], verifySeal(history, 3n), FAST).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(TrustBaseUpdateError);
      expect((error as TrustBaseUpdateError).appended).toBe(1);
    });
  });

  it('does not fetch for a failure that no fetch can help (another network, a round outside the epoch)', async () => {
    const history = await atGenesis();
    const source = new Counting(buildBundle(rangeFields()));
    const other = await verifyWithUpdate(history, [source], verifySeal(history, 9n, NetworkId.fromId(6)), FAST);
    expect(other.status).toBe(VerificationStatus.FAIL);
    expect(source.requests).toHaveLength(0);
  });

  it('returns the first result when the update finds nothing newer, and does not verify a second time', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    const nothing = new Counting(buildBundle({ ...f, effectiveEnd: 1n, endEntryId: null, entries: [], status: 3n }));
    let calls = 0;
    const verify = verifySeal(history, 5n);
    const result = await verifyWithUpdate(
      history,
      [nothing],
      () => {
        calls++;
        return verify();
      },
      FAST,
    );
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(result.results[0]).toBeInstanceOf(NoTrustBaseEntryResult);
    expect(calls).toBe(1);
  });

  it('retries once only: an epoch still missing after the update is returned as the no-entry failure', async () => {
    const history = await atGenesis();
    const source = new Counting(buildBundle(rangeFields()));
    const result = await verifyWithUpdate(history, [source], verifySeal(history, 7n), FAST);
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect((result.results[0] as NoTrustBaseEntryResult).epoch).toBe(7n);
    expect(source.requests).toHaveLength(1);
  });

  it('lets the update failure through', async () => {
    const history = await atGenesis();
    const failing: ITrustBaseSource = { getTrustBasePage: () => Promise.reject(new Error('down')) };
    await expect(verifyWithUpdate(history, [failing], verifySeal(history, 3n), FAST)).rejects.toBeInstanceOf(
      TrustBaseUpdateError,
    );
  });
});
