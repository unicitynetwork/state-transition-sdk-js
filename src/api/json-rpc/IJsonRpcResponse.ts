/**
 * JSON-RPC response.
 * @interface IJsonRpcResponse
 */
export interface IJsonRpcResponse {
  /**
   * Error data.
   */
  readonly error?: Readonly<{
    code: number;
    message: string;
  }>;
  /**
   * Request ID.
   */
  readonly id: string | number | null;
  /**
   * JSON-RPC version.
   */
  readonly jsonrpc: string;
  /**
   * Result data.
   */
  readonly result?: string;
}
