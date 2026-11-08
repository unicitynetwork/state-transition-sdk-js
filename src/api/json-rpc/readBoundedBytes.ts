import { JsonRpcResponseError } from './JsonRpcResponseError.js';

/**
 * Read a response body as bytes, rejecting bodies larger than `maxBytes`.
 *
 * @param {Response} response Fetch response.
 * @param {number} maxBytes Maximum allowed body size in bytes.
 * @returns {Promise<Uint8Array>} The body, empty when the response has none.
 * @throws {JsonRpcResponseError} If the body exceeds `maxBytes`.
 */
export async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    let result = await reader.read();
    while (!result.done) {
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new JsonRpcResponseError('Response exceeds the maximum allowed size.');
      }
      chunks.push(result.value);
      result = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
