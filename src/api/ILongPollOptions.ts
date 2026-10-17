/**
 * Tuning of a long poll (`waitMs`) that an SDK entry point sizes from the time it has left: the wait of one request is
 * `floor(max(0, min(windowMs, left - marginMs)))`, the window alone while the time left is unknown.
 */
export interface ILongPollOptions {
  /**
   * HTTP response margin in milliseconds that is kept between the end of a server wait and the end of the time left,
   * and that the transport timeout of a request adds to its wait. Raise it for slow links or proxies. Defaults to 2000.
   */
  readonly marginMs?: number;
  /** Preferred window of one long poll in milliseconds; the aggregator clamps it to its own maximum. Defaults to 20000. */
  readonly windowMs?: number;
}
