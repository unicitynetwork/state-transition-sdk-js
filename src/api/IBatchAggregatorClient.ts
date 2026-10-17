import { PartitionView } from './bft/PartitionView.js';
import { IAggregatorClient } from './IAggregatorClient.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { IRequestOptions } from './IRequestOptions.js';
import { StateId } from './StateId.js';
import { DataHash } from '../crypto/hash/DataHash.js';

/** Most state ids of one `get_inclusion_proofs.v1` call. */
export const BATCH_MAX_STATE_IDS = 256;

/**
 * Options of {@link IBatchAggregatorClient.getInclusionProofs}.
 */
export interface IBatchRequestOptions extends IRequestOptions {
  /**
   * Exact state root (the `InputRecord.hash` of the target unicity certificate), a SHA-256 hash. Omitted means the
   * latest finalized view. An exact root is never replaced by the latest one.
   */
  readonly stateRoot?: DataHash;

  /**
   * Ask the aggregator to hold a **latest** request for up to this many milliseconds while every state that is not yet
   * proven is merely pending, and to echo the time it waited as {@link InclusionProofBatch.waitedMs} (or
   * {@link BatchProofError.waitedMs} on a failure). Opt-in: omitted, the request is exactly what it always was. `0` asks
   * for the echo without waiting. The aggregator bounds the wait. A server without the feature rejects the unknown
   * field with the generic `malformed_params`, and the client then repeats the request **once** without `waitMs` under
   * the same signal (see {@link InclusionProofBatch.requests}); nothing is remembered for later calls.
   *
   * Not allowed with `stateRoot`: an exact root request is never waited on and fails with a `rejected` error before
   * anything is sent. Must be an integer in `[0, Number.MAX_SAFE_INTEGER]`, otherwise the same `rejected` error.
   */
  readonly waitMs?: number;
}

/**
 * Result of one `get_inclusion_proofs.v1` call: proofs of all requested states, in request order, served from one
 * finalized local view of the shard. A decoded batch is **not** verified proof material.
 */
export class InclusionProofBatch {
  private readonly _partitionView: Uint8Array | null;
  private readonly _proofs: InclusionProofResponse[];
  private readonly _requests: 1 | 2;
  private readonly _waitedMs: number | null;

  /**
   * @param {InclusionProofResponse[]} proofs Decoded `get_inclusion_proof.v2` results, one per requested state.
   * @param {Uint8Array|null} partitionView Canonical CBOR of the partition view, present for latest requests only.
   * @param {object} [wait] Long-poll metadata of the call, absent for a plain one.
   * @param {number} [wait.requests] HTTP requests the call took: 1 (the default), or 2 after the one retry without `waitMs`.
   * @param {number|null} [wait.waitedMs] The aggregator's echo of the time it waited, `null` (the default) if it sent none.
   */
  public constructor(
    proofs: readonly InclusionProofResponse[],
    partitionView: Uint8Array | null = null,
    wait: { readonly requests?: 1 | 2; readonly waitedMs?: number | null } = {},
  ) {
    this._proofs = proofs.slice();
    this._partitionView = partitionView ? new Uint8Array(partitionView) : null;
    this._requests = wait.requests ?? 1;
    this._waitedMs = wait.waitedMs ?? null;
  }

  /**
   * @returns {Uint8Array|null} Copy of the partition view bytes (the exact bytes the service sent), or `null`.
   */
  public get partitionViewBytes(): Uint8Array | null {
    return this._partitionView ? new Uint8Array(this._partitionView) : null;
  }

  /**
   * @returns {InclusionProofResponse[]} Copy of the proof list.
   */
  public get proofs(): InclusionProofResponse[] {
    return this._proofs.slice();
  }

  /**
   * @returns {number} HTTP requests the call took: 1, or 2 when the aggregator did not know `waitMs` (generic
   *   `malformed_params`) and the call was repeated once without it.
   */
  public get requests(): 1 | 2 {
    return this._requests;
  }

  /**
   * @returns {number|null} The aggregator's **unauthenticated** echo of the time it waited, in milliseconds, or `null`
   *   if the request asked for no wait or the aggregator sent no echo. Timing metadata only, never evidence.
   */
  public get waitedMs(): number | null {
    return this._waitedMs;
  }

  /**
   * Strictly decode the partition view. The result is an untrusted candidate, see `PartitionViewAuthenticator`.
   *
   * @returns {PartitionView|null} Candidate view, or `null` if the response carried none.
   * @throws {PartitionViewError} If the bytes are not a valid view.
   */
  public decodePartitionView(): PartitionView | null {
    return this._partitionView ? PartitionView.fromCBOR(this._partitionView) : null;
  }
}

/**
 * Optional capability of an aggregator client: batch inclusion proofs bound to one finalized local view.
 *
 * Separate from {@link IAggregatorClient}, which is unchanged: custom transports and test doubles need not implement
 * it. A client without it cannot be used for consolidation, and single-proof calls are never emulated as a batch.
 */
export interface IBatchAggregatorClient extends IAggregatorClient {
  /**
   * `get_inclusion_proofs.v1`: 1..{@link BATCH_MAX_STATE_IDS} distinct state ids, all routed to this shard, answered
   * atomically from one finalized view or not at all.
   *
   * Implementations should honour `options.signal`, but callers (the consolidation) do not rely on it: they race every
   * request against their deadline, so a transport that ignores the signal cannot hang an attempt.
   *
   * @param {StateId[]} stateIds State ids to prove.
   * @param {IBatchRequestOptions} [options] Optional exact root and abort signal.
   * @returns {Promise<InclusionProofBatch>} Proofs in request order, plus the partition view for a latest request.
   * @throws {BatchProofError} Typed service, transport or response failure.
   */
  getInclusionProofs(stateIds: readonly StateId[], options?: IBatchRequestOptions): Promise<InclusionProofBatch>;
}

/**
 * @param {IAggregatorClient} client Any aggregator client.
 * @returns {boolean} True if the client implements the batch capability.
 */
export function isBatchAggregatorClient(client: IAggregatorClient): client is IBatchAggregatorClient {
  return typeof (client as Partial<IBatchAggregatorClient>).getInclusionProofs === 'function';
}
