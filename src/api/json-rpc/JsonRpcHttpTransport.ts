import { v4 as uuid } from 'uuid';

import { IJsonRpcResponse } from './IJsonRpcResponse.js';
import { JsonRpcDataError } from './JsonRpcDataError.js';
import { JsonRpcNetworkError } from './JsonRpcNetworkError.js';

/**
 * JSON-RPC HTTP service.
 */
export class JsonRpcHttpTransport {
  private readonly url: string;

  /**
   * JSON-RPC HTTP service constructor.
   */
  public constructor(url: string) {
    this.url = url;
  }

  /**
   * Send a JSON-RPC request.
   */
  public async request(method: string, params: unknown | null): Promise<unknown> {
    const response = await fetch(this.url, {
      body: JSON.stringify({
        id: uuid(),
        jsonrpc: '2.0',
        method,
        params,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new JsonRpcNetworkError(response.status, await response.text());
    }

    const data = (await response.json()) as IJsonRpcResponse;

    if (data.error) {
      throw new JsonRpcDataError(data.error);
    }

    return data.result;
  }
}
