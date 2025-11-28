/**
 * JSON-RPC error object.
 */
export class JsonRpcDataError extends Error {
  public readonly name: string = 'JsonRpcError';

  public readonly code: number;

  /**
   * JSON-RPC error object constructor.
   * @param {{code: number; message: string}} data Error data.
   */
  public constructor({ code, message }: { code: number; message: string }) {
    super(message);
    this.code = code;
  }

  /**
   * Error info to string.
   */
  public toString(): string {
    return `{ code: ${this.code}, message: ${this.message} }`;
  }
}
