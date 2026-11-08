import {
  buildBundle,
  IBundleFields,
  loadVectors,
  parseBundleFields,
  parseEntryFields,
  rangeFields,
  signEntry,
  buildChain,
} from './TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import {
  HistoryConflictedError,
  TrustBaseConflictError,
  TrustBaseUpdateError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseHistory } from '../../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { TrustBaseStatus } from '../../../../../src/api/bft/trustbase/TrustBaseRange.js';
import { encodeTrustBaseResponse } from '../../../../../src/api/bft/trustbase/TrustBaseResponseWire.js';
import { TrustBaseUpdater } from '../../../../../src/api/bft/trustbase/TrustBaseUpdater.js';
import { ITrustBaseRequest, ITrustBaseSource } from '../../../../../src/api/ITrustBaseSource.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

type Handler = (request: ITrustBaseRequest, call: number) => Promise<Uint8Array>;

class FakeSource implements ITrustBaseSource {
  public readonly requests: ITrustBaseRequest[] = [];

  public constructor(private readonly handler: Handler) {}

  public getTrustBasePage(request: ITrustBaseRequest): Promise<Uint8Array> {
    this.requests.push(request);
    return this.handler(request, this.requests.length);
  }
}

const FAST = { backoffMs: 0 };
const serve = (bytes: Uint8Array): FakeSource => new FakeSource(() => Promise.resolve(bytes));
const fail = (): FakeSource => new FakeSource(() => Promise.reject(new Error('unreachable')));

const refusal = (status: TrustBaseStatus, effectiveEnd = 1n): Uint8Array =>
  buildBundle({
    ...rangeFields(),
    effectiveEnd,
    endEntryId: null,
    entries: [],
    status: BigInt(status),
  });

/** A history holding the genesis of the three-entry vector. */
async function atGenesis(): Promise<TrustBaseHistory> {
  const fields = threeEntries();
  const history = TrustBaseHistory.create(await RootTrustBaseV2.decode(fields.entries[0]).entryId());
  await history.append(RootTrustBaseV2.decode(fields.entries[0]));
  return history;
}

function threeEntries(): IBundleFields {
  const vector = loadVectors().bundles.find((candidate) => candidate.name.startsWith('three'));
  return parseBundleFields(HexConverter.decode(vector?.hex ?? ''));
}

const failure = async (promise: Promise<unknown>): Promise<TrustBaseUpdateError> => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TrustBaseUpdateError);
  return error as TrustBaseUpdateError;
};

describe('TrustBaseUpdater', () => {
  it('appends the entries after the tip from one page, asking from the tip epoch + 1', async () => {
    const history = await atGenesis();
    const source = serve(buildBundle(rangeFields()));

    await expect(TrustBaseUpdater.update(history, [source], FAST)).resolves.toBe(2);

    expect(history.tip?.epoch).toBe(3n);
    expect(source.requests).toHaveLength(1);
    expect(source.requests[0].fromEpoch).toBe(2n);
    expect(source.requests[0].snapshot).toBeNull();
    expect(source.requests[0].network.id).toBe(5);
  });

  it('follows the cursor and echoes the end epoch and entry id of the first page on the next', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    const endId = await RootTrustBaseV2.decode(f.entries[1]).entryId();
    const source = new FakeSource((request) =>
      Promise.resolve(
        request.snapshot === null
          ? buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n })
          : buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 3n }),
      ),
    );

    await expect(TrustBaseUpdater.update(history, [source], FAST)).resolves.toBe(2);

    expect(source.requests.map((request) => request.fromEpoch)).toEqual([2n, 3n]);
    expect(source.requests[1].snapshot?.end).toBe(3n);
    expect(HexConverter.encode(source.requests[1].snapshot?.entryId ?? new Uint8Array())).toBe(
      HexConverter.encode(endId),
    );
  });

  it('a source that has nothing newer is a result, not an error: 0 appended', async () => {
    const history = await atGenesis();
    await expect(
      TrustBaseUpdater.update(history, [serve(refusal(TrustBaseStatus.NOT_YET_AVAILABLE))], FAST),
    ).resolves.toBe(0);
    expect(history.tip?.epoch).toBe(1n);
  });

  it('is current only when every source says nothing newer', async () => {
    const history = await atGenesis();
    const nothing = refusal(TrustBaseStatus.NOT_YET_AVAILABLE);
    await expect(TrustBaseUpdater.update(history, [serve(nothing), serve(nothing)], FAST)).resolves.toBe(0);

    const error = await failure(TrustBaseUpdater.update(history, [serve(nothing), fail()], { ...FAST, rounds: 1 }));
    expect(error.causes).toHaveLength(1);
  });

  it('does not take a source that claims an end at or after the wanted epoch as "nothing newer"', async () => {
    const history = await atGenesis();
    const lagging = serve(refusal(TrustBaseStatus.NOT_YET_AVAILABLE, 2n));
    await failure(TrustBaseUpdater.update(history, [lagging], { ...FAST, rounds: 1 }));
    expect(history.tip?.epoch).toBe(1n);
  });

  it('a source that lags behind the snapshot is a failure and keeps the authenticated prefix', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    const lagging = refusal(TrustBaseStatus.NOT_YET_AVAILABLE, 2n);
    const source = new FakeSource((request) =>
      Promise.resolve(
        request.snapshot === null ? buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n }) : lagging,
      ),
    );
    await failure(TrustBaseUpdater.update(history, [source], { ...FAST, rounds: 1 }));
    expect(history.tip?.epoch).toBe(2n);
  });

  it('falls through to the next source when one is unreachable', async () => {
    const history = await atGenesis();
    await expect(TrustBaseUpdater.update(history, [fail(), serve(buildBundle(rangeFields()))], FAST)).resolves.toBe(2);
  });

  it('does not ask a source again after a final refusal, but does after busy and unavailable', async () => {
    const history = await atGenesis();
    const final = serve(refusal(TrustBaseStatus.HISTORY_MISMATCH));
    const busy = serve(refusal(TrustBaseStatus.BUSY));
    const error = await failure(TrustBaseUpdater.update(history, [final, busy], FAST));
    expect(final.requests).toHaveLength(1);
    expect(busy.requests).toHaveLength(2);
    expect(error.causes).toHaveLength(3);
  });

  it('a busy source that recovers on the second pass serves the range', async () => {
    const history = await atGenesis();
    const busy = refusal(TrustBaseStatus.BUSY);
    const good = buildBundle(rangeFields());
    const source = new FakeSource((_request, call) => Promise.resolve(call === 1 ? busy : good));
    await expect(TrustBaseUpdater.update(history, [source], FAST)).resolves.toBe(2);
  });

  it('a source that serves an entry the history refuses is skipped and the next source serves the range', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    const thin = signEntry(parseEntryFields(f.entries[0]), ['a']);
    const bad = serve(
      buildBundle({
        ...f,
        effectiveEnd: 2n,
        endEntryId: await RootTrustBaseV2.decode(thin).entryId(),
        entries: [thin],
      }),
    );
    const good = serve(buildBundle(f));

    await expect(TrustBaseUpdater.update(history, [bad, good], FAST)).resolves.toBe(2);
    expect(bad.requests).toHaveLength(1);
    expect(history.tip?.epoch).toBe(3n);
  });

  it('a response for another network or garbage bytes is a failure of that source', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    const error = await failure(
      TrustBaseUpdater.update(history, [serve(buildBundle({ ...f, network: 6n })), serve(new Uint8Array([1, 2, 3]))], {
        ...FAST,
        rounds: 1,
      }),
    );
    expect(error.causes).toHaveLength(2);
  });

  it('a page that does not continue the requested range is a failure', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    // epoch 3 only, though epoch 2 was asked for
    const skipping = buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 3n });
    await failure(TrustBaseUpdater.update(history, [serve(skipping)], { ...FAST, rounds: 1 }));
    expect(history.tip?.epoch).toBe(1n);
  });

  it('catches an empty history up from the genesis when it is given the network', async () => {
    const f = threeEntries();
    const history = TrustBaseHistory.create(await RootTrustBaseV2.decode(f.entries[0]).entryId());
    const source = serve(buildBundle(f));

    await expect(TrustBaseUpdater.update(history, [source], { ...FAST, network: NetworkId.fromId(5) })).resolves.toBe(
      3,
    );
    expect(source.requests[0].fromEpoch).toBe(1n);
    expect(history.tip?.epoch).toBe(3n);
  });

  it('refuses an empty history without a network, and no sources', async () => {
    const history = TrustBaseHistory.create(new Uint8Array(32));
    const source = serve(buildBundle(threeEntries()));
    const noNetwork = await failure(TrustBaseUpdater.update(history, [source], FAST));
    expect(noNetwork.message).toMatch(/no network/);
    expect(source.requests).toHaveLength(0);
    const noSource = await failure(TrustBaseUpdater.update(await atGenesis(), [], FAST));
    expect(noSource.message).toMatch(/No source/);
  });

  it('shares one update between concurrent callers of the same history', async () => {
    const history = await atGenesis();
    const source = serve(buildBundle(rangeFields()));
    const [a, b] = await Promise.all([
      TrustBaseUpdater.update(history, [source], FAST),
      TrustBaseUpdater.update(history, [source], FAST),
    ]);
    expect([a, b]).toEqual([2, 2]);
    expect(source.requests).toHaveLength(1);
    // and a later update is a new one
    await expect(TrustBaseUpdater.update(history, [serve(refusal(3))], FAST)).resolves.toBe(0);
  });

  it('stops at an aborted signal without asking', async () => {
    const history = await atGenesis();
    const source = serve(buildBundle(rangeFields()));
    const controller = new AbortController();
    controller.abort(new Error('deadline'));
    await expect(TrustBaseUpdater.update(history, [source], { ...FAST, signal: controller.signal })).rejects.toThrow(
      'deadline',
    );
    expect(source.requests).toHaveLength(0);
  });

  it('asks a source that was unavailable again, like a busy one', async () => {
    const history = await atGenesis();
    const down = refusal(TrustBaseStatus.UNAVAILABLE);
    const good = buildBundle(rangeFields());
    const source = new FakeSource((_request, call) => Promise.resolve(call === 1 ? down : good));
    await expect(TrustBaseUpdater.update(history, [source], FAST)).resolves.toBe(2);
  });

  it('pauses between passes over the sources', async () => {
    const history = await atGenesis();
    const times: number[] = [];
    const busy = refusal(TrustBaseStatus.BUSY);
    const source = new FakeSource(() => {
      times.push(Date.now());
      return Promise.resolve(busy);
    });
    await failure(TrustBaseUpdater.update(history, [source], { backoffMs: 60, rounds: 2 }));
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(50);
  });

  it('names the page that does not continue the requested range', async () => {
    const history = await atGenesis();
    const f = rangeFields();
    const skipping = buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 3n });
    const error = await failure(TrustBaseUpdater.update(history, [serve(skipping)], { ...FAST, rounds: 1 }));
    expect((error.causes[0] as Error).message).toMatch(/does not continue the requested range/);
    expect(history.tip?.epoch).toBe(1n);
  });

  it('refuses a later page that names another end epoch or another end entry id than the first page announced', async () => {
    const f = rangeFields();
    const first = buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n });
    const otherEnd = buildBundle({ ...f, effectiveEnd: 4n, entries: [f.entries[1]], fromEpoch: 3n, nextEpoch: 4n });
    const otherId = buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 3n });

    const announced = parseBundleFields(first);
    // the first page announces end 3 with an end id that is not the id of epoch 3
    const wrongId = buildBundle({ ...announced, endEntryId: new Uint8Array(32).fill(0x33) });

    for (const [pages, expected] of [
      [[first, otherEnd], 1],
      [[wrongId, otherId], 1],
    ] as const) {
      const history = await atGenesis();
      const source = new FakeSource((_request, call) => Promise.resolve(pages[call - 1]));
      const error = await failure(TrustBaseUpdater.update(history, [source], { ...FAST, rounds: expected }));
      expect((error.causes.at(-1) as Error).message).toMatch(/does not continue the requested range/);
      expect(history.tip?.epoch).toBe(2n);
    }
  });

  it('continues from the cursor, which may be more than one entry after the page start', async () => {
    const f = threeEntries();
    const history = TrustBaseHistory.create(await RootTrustBaseV2.decode(f.entries[0]).entryId());
    const pageOne = buildBundle({ ...f, entries: [f.entries[0], f.entries[1]], nextEpoch: 3n });
    const pageTwo = buildBundle({ ...f, entries: [f.entries[2]], fromEpoch: 3n });
    const source = new FakeSource((request) => Promise.resolve(request.fromEpoch === 1n ? pageOne : pageTwo));

    await expect(TrustBaseUpdater.update(history, [source], { ...FAST, network: NetworkId.fromId(5) })).resolves.toBe(
      3,
    );
    expect(source.requests.map((request) => request.fromEpoch)).toEqual([1n, 3n]);
  });

  it('does not wrap an error that is not a trust-base error', async () => {
    const history = await atGenesis();
    const boom = new Error('boom');
    jest.spyOn(history, 'append').mockRejectedValue(boom);
    await expect(TrustBaseUpdater.update(history, [serve(buildBundle(rangeFields()))], FAST)).rejects.toBe(boom);
  });

  describe('an authenticated fork', () => {
    it('is rethrown, not counted as a refusal of the source: no other source is tried', async () => {
      const history = await atGenesis();
      const entries = threeEntries().entries;
      const fork = new TrustBaseConflictError(2n, 'fork', {
        authenticated: true,
        epoch: 2n,
        heldEntry: null,
        heldEntryId: new Uint8Array(32),
        network: 1,
        offeredEntry: null,
        offeredEntryId: new Uint8Array(32).fill(1),
      });
      const target = {
        append: (): Promise<'appended'> => Promise.reject(fork),
        networkId: history.networkId,
        tip: history.tip,
      };
      const first = serve(buildBundle({ ...rangeFields(), entries: entries.slice(1), fromEpoch: 2n }));
      const second = serve(buildBundle({ ...rangeFields(), entries: entries.slice(1), fromEpoch: 2n }));
      await expect(TrustBaseUpdater.update(target, [first, second], FAST)).rejects.toBe(fork);
      expect(second.requests).toHaveLength(0);
    });

    it('is rethrown when the target says it is closed', async () => {
      const history = await atGenesis();
      const entries = threeEntries().entries;
      const closed = new HistoryConflictedError(new TrustBaseConflictError(2n, 'fork'));
      const target = {
        append: (): Promise<'appended'> => Promise.reject(closed),
        networkId: history.networkId,
        tip: history.tip,
      };
      const first = serve(buildBundle({ ...rangeFields(), entries: entries.slice(1), fromEpoch: 2n }));
      const second = serve(buildBundle({ ...rangeFields(), entries: entries.slice(1), fromEpoch: 2n }));
      await expect(TrustBaseUpdater.update(target, [first, second], FAST)).rejects.toBe(closed);
      expect(second.requests).toHaveLength(0);
    });
  });

  describe('the frozen range belongs to the whole call', () => {
    // A announces the end 3, serves epoch 2, then fails. Afterwards A and a lagging B both say there is nothing newer than 2.
    const scenario = async (): Promise<{ a: FakeSource; b: FakeSource; history: TrustBaseHistory }> => {
      const history = await atGenesis();
      const f = rangeFields();
      const a = new FakeSource((request, call) => {
        if (call === 1) {
          return Promise.resolve(buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n }));
        }
        return call === 2
          ? Promise.reject(new Error('gone'))
          : Promise.resolve(refusal(TrustBaseStatus.NOT_YET_AVAILABLE, 2n));
      });
      const b = serve(refusal(TrustBaseStatus.NOT_YET_AVAILABLE, 2n));
      return { a, b, history };
    };

    it('does not count a source that only knows the older tip as "current" once an end was announced', async () => {
      const { a, b, history } = await scenario();
      const error = await failure(TrustBaseUpdater.update(history, [a, b], FAST));
      expect(error.appended).toBe(1);
      expect(history.tip?.epoch).toBe(2n);
      // B was asked to continue the announced range, not to start a new one.
      expect(b.requests[0].fromEpoch).toBe(3n);
      expect(b.requests[0].snapshot?.end).toBe(3n);
    });

    it('control: a source that serves the rest completes the call', async () => {
      const { a, history } = await scenario();
      const f = rangeFields();
      const rest = serve(buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 3n }));
      await expect(TrustBaseUpdater.update(history, [a, rest], FAST)).resolves.toBe(2);
      expect(history.tip?.epoch).toBe(3n);
    });

    it('drops the frozen range when the history moved on by other means', async () => {
      const history = await atGenesis();
      const f = rangeFields();
      const a = new FakeSource(async (_request, call) => {
        if (call === 1) {
          return buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n });
        }
        if (call > 2) {
          return refusal(TrustBaseStatus.NOT_YET_AVAILABLE, 3n);
        }
        // Meanwhile another writer appends the rest.
        await history.append(RootTrustBaseV2.decode(f.entries[1]));
        throw new Error('gone');
      });
      const b = serve(refusal(TrustBaseStatus.NOT_YET_AVAILABLE, 3n));
      await expect(TrustBaseUpdater.update(history, [a, b], FAST)).resolves.toBe(1);
      expect(b.requests[0].fromEpoch).toBe(4n);
      expect(b.requests[0].snapshot).toBeNull();
    });

    it('a history mismatch on an echoed snapshot drops the snapshot and does not end the honest source', async () => {
      const history = await atGenesis();
      const f = rangeFields();
      // The hostile source announces a fake end entry id after one genuine entry, then is gone.
      const hostile = new FakeSource((_request, call) =>
        call === 1
          ? Promise.resolve(
              buildBundle({ ...f, endEntryId: new Uint8Array(32).fill(7), entries: [f.entries[0]], nextEpoch: 3n }),
            )
          : Promise.reject(new Error('gone')),
      );
      // The honest source refuses the fake snapshot, as bft-core does, and serves from the tip without one.
      const honest = new FakeSource((request) =>
        Promise.resolve(
          request.snapshot === null
            ? buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 3n })
            : refusal(TrustBaseStatus.HISTORY_MISMATCH, 3n),
        ),
      );
      await expect(TrustBaseUpdater.update(history, [hostile, honest], FAST)).resolves.toBe(2);
      expect(history.tip?.epoch).toBe(3n);
      expect(honest.requests.map((r) => r.snapshot === null)).toEqual([false, true]);
      expect(honest.requests[1].fromEpoch).toBe(3n);
    });

    it('control: a mismatch on a request without a snapshot is still final', async () => {
      const history = await atGenesis();
      const source = serve(refusal(TrustBaseStatus.HISTORY_MISMATCH));
      await failure(TrustBaseUpdater.update(history, [source], FAST));
      expect(source.requests).toHaveLength(1);
    });

    it('starts over after a refused entry', async () => {
      const history = await atGenesis();
      const f = rangeFields();
      const bad = serve(buildBundle({ ...f, entries: [f.entries[1]], fromEpoch: 2n }));
      const good = serve(buildBundle(f));
      await expect(TrustBaseUpdater.update(history, [bad, good], FAST)).resolves.toBe(2);
      expect(good.requests[0].fromEpoch).toBe(2n);
      expect(good.requests[0].snapshot).toBeNull();
    });

    it('drops the announced range when a later page has an entry the history refuses, and the next source starts from the tip', async () => {
      const chain = await buildChain(5);
      const forged = await buildChain(5, { forkAt: 2, signers: ['a'], tag: 0xd5 });
      const history = TrustBaseHistory.create(await chain[0].entryId());
      await history.append(chain[0]);
      const lastId = await chain[4].entryId();
      const response = (
        entries: RootTrustBaseV2[],
        from: bigint,
        end: RootTrustBaseV2,
        next: bigint | null,
      ): Uint8Array =>
        encodeTrustBaseResponse({
          effectiveEnd: end.epoch,
          endEntryId: lastId,
          entries: entries.map((entry) => entry.encode()),
          fromEpoch: from,
          network: chain[0].networkId.id,
          nextEpoch: next,
          status: 0n,
        });
      const liar = new FakeSource((request) =>
        Promise.resolve(
          request.snapshot === null
            ? response([chain[1]], 2n, chain[4], 3n)
            : response([forged[2], forged[3]], 3n, chain[4], 5n),
        ),
      );
      const honest = new FakeSource(() => Promise.resolve(response(chain.slice(2), 3n, chain[4], null)));
      await expect(TrustBaseUpdater.update(history, [liar, honest], FAST)).resolves.toBe(4);
      expect(honest.requests[0].fromEpoch).toBe(3n);
      expect(honest.requests[0].snapshot).toBeNull();
    });
  });
});
