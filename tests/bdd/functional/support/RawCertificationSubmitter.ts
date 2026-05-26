import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationRequest } from '../../../../src/api/CertificationRequest.js';
import { CertificationResponse } from '../../../../src/api/CertificationResponse.js';
import { JsonRpcHttpTransport } from '../../../../src/api/json-rpc/JsonRpcHttpTransport.js';
import { StateId } from '../../../../src/api/StateId.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

/**
 * A canonical certification_request: exactly the bytes the SDK would submit
 * (CertificationRequest.toCBOR()), plus its derived stateId. Negative tests mutate `bytes`
 * into non-canonical forms and submit them raw via {@link submitRawCertificationRequest}.
 */
export interface ICanonicalRequest {
  bytes: Uint8Array;
  stateId: StateId;
}

/** Aggregator endpoint the raw seam posts to (same env the functional run uses). */
export function aggregatorUrl(): string {
  return process.env.AGGREGATOR_URL ?? 'http://localhost:3000';
}

export function aggregatorApiKey(): string | null {
  return process.env.AGGREGATOR_API_KEY ?? null;
}

/**
 * Build a real, canonical certification_request from already-built certification data.
 * The bytes are produced by the SDK's canonical serializer; tests mutate them.
 */
export async function buildCanonicalCertificationRequest(certData: CertificationData): Promise<ICanonicalRequest> {
  const request = await CertificationRequest.create(certData);
  return { bytes: request.toCBOR(), stateId: request.stateId };
}

/**
 * Test-only raw submit: POST arbitrary bytes as the `certification_request` JSON-RPC payload,
 * bypassing CertificationRequest.toCBOR() (which always emits canonical CBOR). Mirrors
 * AggregatorClient.submitCertificationRequest's headers (X-State-ID for routing, X-API-Key)
 * so the bytes reach the aggregator's canonical-CBOR validator (aggregator-go#153).
 *
 * Returns the parsed response on success. The underlying transport throws on a JSON-RPC error
 * (JsonRpcDataError) or an HTTP error (JsonRpcNetworkError) — callers assert the rejection.
 */
export async function submitRawCertificationRequest(
  requestBytes: Uint8Array,
  stateId: StateId,
): Promise<CertificationResponse> {
  const transport = new JsonRpcHttpTransport(aggregatorUrl());
  const headers = new Headers([['X-State-ID', HexConverter.encode(stateId.data)]]);
  const key = aggregatorApiKey();
  if (key) {
    headers.set('X-API-Key', key);
  }
  const response = await transport.request('certification_request', HexConverter.encode(requestBytes), headers);
  return CertificationResponse.fromJSON(response);
}
