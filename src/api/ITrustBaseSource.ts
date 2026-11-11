import { IRequestOptions } from './IRequestOptions.js';
import { NetworkId } from './NetworkId.js';

/**
 * One GetTrustBase request (bft-core `gettrustbase.Request`, without the end epoch, which the SDK never sets).
 */
export interface ITrustBaseRequest {
  /** First epoch wanted: the latest held epoch + 1, or the cursor of the previous page. */
  readonly fromEpoch: bigint;
  /** Most entries wanted in the response. */
  readonly maxEntries: number;
  readonly network: NetworkId;
  /** The end epoch and its entry id the first page announced, echoed on every later page so a source on another history is noticed. */
  readonly snapshot: { readonly end: bigint; readonly entryId: Uint8Array } | null;
}

/**
 * Where newer Unicity Trust Base entries are fetched from: an aggregator's `GET /api/v1/trustbases`, a mirror, a test double. The transport is not
 * ruled; nothing above this interface depends on it. A source is untrusted: it returns the encoded GetTrustBase response (tag 39015) and the caller
 * decodes it with the page limits and appends every entry through `TrustBaseHistory.append`, which authenticates it from the latest held entry.
 */
export interface ITrustBaseSource {
  /**
   * @param {ITrustBaseRequest} request The request.
   * @param {IRequestOptions} [options] Request options.
   * @returns {Promise<Uint8Array>} The encoded response (tag 39015), whatever its status.
   */
  getTrustBasePage(request: ITrustBaseRequest, options?: IRequestOptions): Promise<Uint8Array>;
}
