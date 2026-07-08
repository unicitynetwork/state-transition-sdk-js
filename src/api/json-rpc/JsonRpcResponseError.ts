/**
 * Thrown when a JSON-RPC response is malformed — wrong protocol version,
 * mismatched id, not exactly one of result/error, oversized, or not valid JSON.
 */
export class JsonRpcResponseError extends Error {
  public readonly name: string = 'JsonRpcResponseError';
}
