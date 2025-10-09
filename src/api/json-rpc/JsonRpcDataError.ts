/**
 * JSON-RPC error object.
 */
export class JsonRpcDataError implements Error {
  public readonly code: number;
  public readonly message: string;
  public readonly name: string = 'JsonRpcError';

  /**
   * JSON-RPC error object constructor.
   * @param {{code: number; message: string}} data Error data.
   */
  public constructor({ code, message }: { code: number; message: string }) {
    this.code = code;
    this.message = message;
  }

  /**
   * Error info to string.
   */
  public toString(): string {
    return `{ code: ${this.code}, message: ${this.message} }`;
  }
}
