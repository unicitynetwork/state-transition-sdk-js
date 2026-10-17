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

  private readonly maxResponseBytes: number;
  private readonly url: string;

  /**
   * JSON-RPC HTTP service constructor.
   *
   * @param {string} url Endpoint URL.
   * @param {number} maxResponseBytes Maximum response body size in bytes; defaults to {@link JsonRpcHttpTransport.DEFAULT_MAX_RESPONSE_BYTES}.
   */
  public constructor(url: string, maxResponseBytes: number = JsonRpcHttpTransport.DEFAULT_MAX_RESPONSE_BYTES) {
    this.url = url;
    this.maxResponseBytes = maxResponseBytes;
  }

  /** The error object of an envelope as an error, or a response error if it is not a valid error object. */
  private static dataError(error: unknown, idMatched: boolean): JsonRpcDataError | JsonRpcResponseError {
    if (
      typeof error !== 'object' ||
      error === null ||
      !Number.isSafeInteger((error as { code?: unknown }).code) ||
      typeof (error as { message?: unknown }).message !== 'string'
    ) {
      return new JsonRpcResponseError('JSON-RPC error object needs an integer code and a message.');
    }
    return new JsonRpcDataError(error as { code: number; data?: unknown; message: string }, idMatched);
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

    const body = await JsonRpcHttpTransport.readBoundedText(response, this.maxResponseBytes);
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
        const candidate = JsonRpcHttpTransport.dataError(envelope.error, true);
        rpcError = candidate instanceof JsonRpcDataError ? candidate : undefined;
      }
      throw new JsonRpcNetworkError(response.status, body, rpcError);
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
      throw JsonRpcHttpTransport.dataError(data.error, data.id === id);
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
