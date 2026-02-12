/**
 * JSON-RPC error object.
 */
export class JsonRpcNetworkError extends Error {
  public readonly name: string = 'JsonRpcNetworkError';

  public constructor(
    public readonly status: number,
    public readonly message: string,
  ) {
    super(message);
  }
}
