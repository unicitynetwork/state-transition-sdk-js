import { JsonRpcDataError } from './JsonRpcDataError.js';

/**
 * JSON-RPC error object.
 */
export class JsonRpcNetworkError extends Error {
  public readonly name: string = 'JsonRpcNetworkError';

  /**
   * Set when the body of the non-2xx response is a complete JSON-RPC error envelope for this very request (version 2.0,
   * matching id, an error and no result): the service's own error, whatever the HTTP status is. Additive: the error is
   * still a network error with its status, so code that branches on the status keeps working.
   */
  public readonly rpcError?: JsonRpcDataError;

  public constructor(
    public readonly status: number,
    public readonly message: string,
    rpcError?: JsonRpcDataError,
  ) {
    super(message);
    this.rpcError = rpcError;
  }
}
