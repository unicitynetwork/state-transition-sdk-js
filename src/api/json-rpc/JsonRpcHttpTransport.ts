import { v4 as uuid } from 'uuid';

import { IJsonRpcResponse } from './IJsonRpcResponse.js';
import { JsonRpcDataError } from './JsonRpcDataError.js';
import { JsonRpcNetworkError } from './JsonRpcNetworkError.js';
import { JsonRpcResponseError } from './JsonRpcResponseError.js';
import { IRequestOptions } from '../IRequestOptions.js';

/**
 * JSON-RPC HTTP service.
 */
export class JsonRpcHttpTransport {
  /** Default maximum response body size in bytes, matching the Rust SDK's `MAX_RESPONSE_BODY_BYTES`. */
  public static readonly DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

  private readonly defaultHeaders: readonly (readonly [string, string])[];
  private readonly maxResponseBytes: number;
  private readonly url: string;

  /**
   * JSON-RPC HTTP service constructor.
   *
   * @param {string} url Endpoint URL.
   * @param {number} maxResponseBytes Maximum response body size in bytes; defaults to {@link JsonRpcHttpTransport.DEFAULT_MAX_RESPONSE_BYTES}.
   * @param {[string, string][]} defaultHeaders Headers added to every request unless the request sets the same header itself.
   */
  public constructor(
    url: string,
    maxResponseBytes: number = JsonRpcHttpTransport.DEFAULT_MAX_RESPONSE_BYTES,
    defaultHeaders: readonly (readonly [string, string])[] = [],
  ) {
    this.url = url;
    this.maxResponseBytes = maxResponseBytes;
    this.defaultHeaders = defaultHeaders;
  }

  /** The error object of an envelope as an error, or a response error if it is not a valid error object. */
  /**
   * The `Retry-After` header as milliseconds (RFC 9110): delay-seconds of any length saturate at 60 s, an HTTP-date is
   * the date minus the local clock (floored at 0, capped at 60 s), a sign or anything else is ignored.
   *
   * @param {string | null} value Header value.
   * @param {number} [now] Local time in milliseconds (for the date form).
   * @returns {number | undefined} Milliseconds, `undefined` when absent or not a valid form.
   */
  public static parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
    const trimmed = value?.trim();
    if (trimmed === undefined || trimmed === '') {
      return undefined;
    }
    if (/^\d+$/.test(trimmed)) {
      return Math.min(Number(trimmed), 60) * 1000;
    }
    const when = JsonRpcHttpTransport.parseHttpDate(trimmed, now);
    return when === undefined ? undefined : Math.min(Math.max(when - now, 0), 60_000);
  }

  private static dataError(
    error: unknown,
    idMatched: boolean,
    retryAfterMs?: number,
  ): JsonRpcDataError | JsonRpcResponseError {
    if (
      typeof error !== 'object' ||
      error === null ||
      !Number.isSafeInteger((error as { code?: unknown }).code) ||
      typeof (error as { message?: unknown }).message !== 'string'
    ) {
      return new JsonRpcResponseError('JSON-RPC error object needs an integer code and a message.');
    }
    return new JsonRpcDataError(error as { code: number; data?: unknown; message: string }, idMatched, retryAfterMs);
  }

  private static parseEnvelope(body: string): IJsonRpcResponse | null {
    try {
      const data: unknown = JSON.parse(body);
      return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as IJsonRpcResponse) : null;
    } catch {
      return null;
    }
  }

  /**
   * An HTTP-date (RFC 9110 §5.6.7) in exactly one of its three forms, IMF-fixdate, RFC 850 or asctime, with every field
   * validated (a day within its month, hour at most 23, ...). Anything else is not a date.
   *
   * @param {string} text The header value.
   * @param {number} now Local time in milliseconds (the two-digit year of RFC 850 is read relative to it).
   * @returns {number | undefined} Milliseconds since the epoch, `undefined` when it is not an HTTP-date.
   */
  private static parseHttpDate(text: string, now: number): number | undefined {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const longDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const time = '(\\d{2}):(\\d{2}):(\\d{2})';
    let day: string, mon: string, year: string, h: string, m: string, sec: string;
    let match = new RegExp(`^(\\w{3}), (\\d{2}) (\\w{3}) (\\d{4}) ${time} GMT$`).exec(text);
    if (match !== null && days.includes(match[1])) {
      [, , day, mon, year, h, m, sec] = match;
    } else if (
      (match = new RegExp(`^(\\w{6,9}), (\\d{2})-(\\w{3})-(\\d{2}) ${time} GMT$`).exec(text)) !== null &&
      longDays.includes(match[1])
    ) {
      [, , day, mon, year, h, m, sec] = match;
      // RFC 9110: a two-digit year more than 50 years in the future is read as the most recent past year with those digits
      const nowYear = new Date(now).getUTCFullYear();
      year = String(2000 + Number(year) > nowYear + 50 ? 1900 + Number(year) : 2000 + Number(year));
    } else if (
      (match = new RegExp(`^(\\w{3}) (\\w{3}) ([ \\d]\\d) ${time} (\\d{4})$`).exec(text)) !== null &&
      days.includes(match[1])
    ) {
      [, , mon, day, h, m, sec, year] = match;
    } else {
      return undefined;
    }
    const month = months.indexOf(mon);
    const [d, y, hh, mm, ss] = [Number(day), Number(year), Number(h), Number(m), Number(sec)];
    if (month < 0 || y < 1970 || hh > 23 || mm > 59 || ss > 60) {
      return undefined;
    }
    const at = Date.UTC(y, month, d, hh, mm, Math.min(ss, 59));
    // a day outside its month rolls over: reject
    return new Date(at).getUTCDate() === d ? at : undefined;
  }

  /**
   * Read a response body as text, rejecting bodies larger than `maxBytes`.
   *
   * @param {Response} response Fetch response.
   * @param {number} maxBytes Maximum allowed body size in bytes.
   * @returns {Promise<string>} The decoded body, or an empty string when the response has no body.
   * @throws {JsonRpcResponseError} If the body exceeds `maxBytes`.
   */
  private static async readBoundedText(response: Response, maxBytes: number): Promise<string> {
    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let total = 0;
    try {
      let result = await reader.read();
      while (!result.done) {
        total += result.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new JsonRpcResponseError('JSON-RPC response exceeds the maximum allowed size.');
        }
        text += decoder.decode(result.value, { stream: true });
        result = await reader.read();
      }
    } finally {
      reader.releaseLock();
    }

    return text + decoder.decode();
  }

  /**
   * Send a JSON-RPC request.
   *
   * @param {string} method JSON-RPC method.
   * @param {unknown} params JSON-RPC params.
   * @param {Headers} headers Optional request headers.
   * @param {IRequestOptions} options Optional per-request options, e.g. an abort signal.
   * @returns {Promise<unknown>} The response result.
   * @throws {JsonRpcNetworkError} On a non-success HTTP status.
   * @throws {JsonRpcDataError} When the response carries a JSON-RPC error object.
   * @throws {JsonRpcResponseError} When the response is malformed (version, id, exclusivity, size).
   */
  public async request(
    method: string,
    params: unknown,
    headers = new Headers(),
    options?: IRequestOptions,
  ): Promise<unknown> {
    headers.set('Content-Type', 'application/json');
    for (const [name, value] of this.defaultHeaders) {
      if (!headers.has(name)) {
        headers.set(name, value);
      }
    }

    const id = uuid();
    const response = await fetch(this.url, {
      body: JSON.stringify({
        id,
        jsonrpc: '2.0',
        method,
        params,
      }),
      headers,
      method: 'POST',
      redirect: 'error',
      signal: options?.signal,
    });

    const retryAfterMs = JsonRpcHttpTransport.parseRetryAfter(response.headers.get('Retry-After'));
    let body: string;
    try {
      body = await JsonRpcHttpTransport.readBoundedText(response, this.maxResponseBytes);
    } catch (e) {
      // the status of a non-2xx answer classifies it even when its body is oversized
      if (!response.ok && e instanceof JsonRpcResponseError) {
        throw new JsonRpcResponseError(e.message, { retryAfterMs, status: response.status });
      }
      throw e;
    }
    const envelope = JsonRpcHttpTransport.parseEnvelope(body);
    if (!response.ok) {
      // Always a network error with its status, as it has been. A complete JSON-RPC error envelope for this very request
      // (version, id, an error and no result) is attached as `rpcError`: the service's own code, whatever the HTTP status
      // is (some deployments answer 404, 409 or 429). Anything else (a proxy page, an empty body, another id or version)
      // says nothing about the request.
      let rpcError: JsonRpcDataError | undefined;
      if (
        envelope !== null &&
        envelope.jsonrpc === '2.0' &&
        envelope.error != null &&
        envelope.result === undefined &&
        envelope.id === id
      ) {
        const candidate = JsonRpcHttpTransport.dataError(envelope.error, true, retryAfterMs);
        rpcError = candidate instanceof JsonRpcDataError ? candidate : undefined;
      }
      throw new JsonRpcNetworkError(response.status, body, rpcError, retryAfterMs);
    }

    if (envelope === null) {
      throw new JsonRpcResponseError('JSON-RPC response is not a valid JSON object.');
    }
    const data = envelope;
    if (data.jsonrpc !== '2.0') {
      throw new JsonRpcResponseError(`Unsupported JSON-RPC version: ${String(data.jsonrpc)}.`);
    }

    const hasResult = data.result !== undefined;
    const hasError = data.error != null;
    if (hasResult && hasError) {
      throw new JsonRpcResponseError('JSON-RPC response must contain exactly one of result or error.');
    }

    if (data.error != null) {
      // an error that answers no request of ours (a null id is what a server uses when it could not read the id) is
      // kept for the callers that tolerate it, marked as not matched
      if (data.id !== id && data.id !== null) {
        throw new JsonRpcResponseError(`JSON-RPC response id mismatch: expected ${id}, got ${String(data.id)}.`);
      }
      throw JsonRpcHttpTransport.dataError(data.error, data.id === id, retryAfterMs);
    }

    if (data.id !== id) {
      throw new JsonRpcResponseError(`JSON-RPC response id mismatch: expected ${id}, got ${String(data.id)}.`);
    }

    if (!hasResult) {
      throw new JsonRpcResponseError('JSON-RPC response must contain exactly one of result or error.');
    }

    return data.result;
  }
}
