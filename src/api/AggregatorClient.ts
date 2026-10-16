import {
  BATCH_INDEX_CLASSES,
  BatchIndexClass,
  BatchIndexesByClass,
  BatchProofError,
  isBatchStateDetail,
} from './BatchProofError.js';
import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { UnicityCertificateInterner } from './bft/UnicityCertificateInterner.js';
import { CertificationData } from './CertificationData.js';
import { CertificationRequest } from './CertificationRequest.js';
import { CertificationResponse, CertificationStatus } from './CertificationResponse.js';
import { IAggregatorClient } from './IAggregatorClient.js';
import {
  BATCH_MAX_STATE_IDS,
  IBatchAggregatorClient,
  IBatchRequestOptions,
  InclusionProofBatch,
} from './IBatchAggregatorClient.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { IInclusionProofRequestOptions, IRequestOptions } from './IRequestOptions.js';
import { JsonRpcDataError } from './json-rpc/JsonRpcDataError.js';
import { JsonRpcHttpTransport } from './json-rpc/JsonRpcHttpTransport.js';
import { JsonRpcNetworkError } from './json-rpc/JsonRpcNetworkError.js';
import { JsonRpcResponseError } from './json-rpc/JsonRpcResponseError.js';
import { parseProofStatusHint } from './ProofStatusHint.js';
import { StateId } from './StateId.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Client implementation for communicating with an aggregator via JSON-RPC.
 */
export class AggregatorClient implements IAggregatorClient, IBatchAggregatorClient {
  private readonly transport: JsonRpcHttpTransport;
  readonly #key: string | null;

  /**
   * Create a new client pointing to the given aggregator URL.
   *
   * @param url Base URL of the aggregator JSON-RPC endpoint
   * @param key API key for authenticating
   * @param allowInsecureTransport When `true`, permit sending the API key over a non-HTTPS URL
   *   (intended for local development and testing only).
   * @throws {Error} If an API key is supplied for a non-HTTPS URL and `allowInsecureTransport` is `false`.
   */
  public constructor(url: string, key: string | null = null, allowInsecureTransport: boolean = false) {
    if (key != null && !allowInsecureTransport && new URL(url).protocol !== 'https:') {
      throw new Error('API key must not be sent over plaintext HTTP; use an https URL.');
    }

    this.#key = key;
    this.transport = new JsonRpcHttpTransport(url);
  }

  private static batchFailure(e: unknown, options?: IBatchRequestOptions): unknown {
    if (e instanceof BatchProofError) {
      return e;
    }
    // caller cancellation and deadline keep their platform identity
    if (
      options?.signal?.aborted ||
      (typeof e === 'object' && e !== null && 'name' in e && (e.name === 'AbortError' || e.name === 'TimeoutError'))
    ) {
      return e;
    }
    if (e instanceof JsonRpcDataError) {
      return AggregatorClient.rpcFailure(e);
    }
    if (e instanceof JsonRpcResponseError) {
      return new BatchProofError('invalid_response', e.message, { cause: e });
    }
    if (e instanceof JsonRpcNetworkError) {
      return new BatchProofError('transport', `HTTP ${e.status}`, {
        cause: e,
        detail: `http_${e.status}`,
        retryable: true,
      });
    }
    return new BatchProofError('transport', e instanceof Error ? e.message : String(e), { cause: e, retryable: true });
  }

  private static decodeBatch(result: unknown, count: number, exact: boolean): InclusionProofBatch {
    const invalid = (message: string, cause?: unknown): BatchProofError =>
      new BatchProofError('invalid_response', message, { cause });
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw invalid('Batch result must be an object.');
    }
    const body = result as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      if (key !== 'proofs' && key !== 'partitionView') {
        throw invalid(`Unexpected batch result field "${key}".`);
      }
    }
    if (!Array.isArray(body.proofs) || body.proofs.length !== count) {
      throw invalid(`Expected ${count} proofs.`);
    }
    // an exact root request never carries a view: it is only meaningful for the latest seal
    if (body.partitionView !== undefined && (exact || typeof body.partitionView !== 'string')) {
      throw invalid('Unexpected partition view.');
    }

    try {
      // the proofs of one batch carry the same local certificate: parse it once
      const interner = new UnicityCertificateInterner((bytes) => UnicityCertificate.fromCBOR(bytes));
      const proofs = body.proofs.map((proof) => {
        if (typeof proof !== 'string') {
          throw new Error('Proof must be a hex string.');
        }
        return InclusionProofResponse.decodeWith(HexConverter.decode(proof), interner);
      });
      const view = typeof body.partitionView === 'string' ? HexConverter.decode(body.partitionView) : null;
      return new InclusionProofBatch(proofs, view);
    } catch (e) {
      throw invalid(`Malformed batch result: ${e instanceof Error ? e.message : String(e)}`, e);
    }
  }

  private static isDuplicateSubmission(e: unknown): boolean {
    if (!(e instanceof JsonRpcDataError) || e.code !== -32603) {
      return false;
    }
    // Heuristic: free text of a server internal error. Only a duplicate on the state id index counts (the Mongo error
    // names the index, `index: stateId_1`); a duplicate on any other index is a real failure. A structured server
    // status replaces this once there is one.
    const text = `${e.message} ${typeof e.data === 'string' ? e.data : ''}`;
    return /E11000|duplicate key/i.test(text) && /index:\s*stateId_/i.test(text);
  }

  /**
   * The offending request indexes of a state status error: `data.indexes` is an object with one list per class
   * (`{"pending":[0],"expired":[2],"unknown":[3]}`, `{"not_in_root":[...]}` for an exact root). Malformed lists are
   * ignored, never trusted for control flow.
   */
  private static offendingIndexes(data: Record<string, unknown>): BatchIndexesByClass | undefined {
    const raw = data.indexes;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return undefined;
    }
    const classes: { -readonly [K in BatchIndexClass]?: number[] } = {};
    let total = 0;
    for (const [klass, list] of Object.entries(raw)) {
      // an unknown class name is dropped, not kept under a free string
      if (!Array.isArray(list) || !(BATCH_INDEX_CLASSES as readonly string[]).includes(klass)) {
        continue;
      }
      const valid = list.filter((i): i is number => Number.isSafeInteger(i) && (i as number) >= 0);
      total += list.length;
      if (valid.length === list.length && total <= BATCH_MAX_STATE_IDS) {
        classes[klass as BatchIndexClass] = valid;
      }
    }
    return Object.keys(classes).length > 0 ? classes : undefined;
  }

  private static rpcFailure(e: JsonRpcDataError): BatchProofError {
    const data = typeof e.data === 'object' && e.data !== null ? (e.data as Record<string, unknown>) : {};
    const detail = typeof data.detail === 'string' ? data.detail : undefined;
    const retryable = data.retryable === true;
    const code = e.code;
    switch (code) {
      case -32008: // proof unavailable
        if (isBatchStateDetail(detail)) {
          // by the contract only a pending state is worth another attempt, whatever else the data says
          return new BatchProofError('unavailable', e.message, {
            code,
            detail,
            ...AggregatorClient.stateIndexes(data, detail),
            retryable: detail === 'state_pending',
          });
        }
        return detail === 'unsupported_configuration'
          ? new BatchProofError('unsupported', e.message, { code, detail })
          : new BatchProofError('unavailable', e.message, { code, detail, retryable });
      case -32006: // concurrency limit: busy, with or without data
        return new BatchProofError('unavailable', e.message, {
          code,
          detail: detail ? `busy:${detail}` : 'busy',
          retryable: true,
        });
      case -32601:
        return new BatchProofError('unsupported', e.message, { code, detail: 'method_not_found' });
      case -32602:
      case -32600:
        return new BatchProofError('rejected', e.message, { code, detail });
      case -32007:
        return new BatchProofError('limit_exceeded', e.message, { code, detail });
      default: // database, internal and unknown codes are operational failures, not unavailability
        return new BatchProofError('server', e.message, { code, detail, retryable });
    }
  }

  private static stateIndexes(
    data: Record<string, unknown>,
    detail: string,
  ): { indexes?: readonly number[]; indexesByClass?: BatchIndexesByClass } {
    const indexesByClass = AggregatorClient.offendingIndexes(data);
    const own = indexesByClass?.[detail.replace(/^state_/, '') as BatchIndexClass];
    return { ...(indexesByClass ? { indexesByClass } : {}), ...(own ? { indexes: own } : {}) };
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProof(
    stateId: StateId,
    options?: IInclusionProofRequestOptions,
  ): Promise<InclusionProofResponse> {
    const data: { includeStatus?: true; stateId: string } = { stateId: HexConverter.encode(stateId.data) };
    if (options?.includeStatusHint === true) {
      data.includeStatus = true;
    }
    const result = await this.transport.request('get_inclusion_proof.v2', data, new Headers(), options);

    // a plain string is the legacy result (and the answer of a server that ignores the flag): no status
    if (typeof result === 'string') {
      return InclusionProofResponse.fromCBOR(HexConverter.decode(result));
    }
    if (typeof result !== 'object' || result === null || typeof (result as { proof?: unknown }).proof !== 'string') {
      throw new JsonRpcResponseError('Unexpected result of get_inclusion_proof.v2.');
    }
    const { proof, status } = result as { proof: string; status?: unknown };
    // an unrecognized status value is treated like no status at all
    return InclusionProofResponse.fromCBOR(HexConverter.decode(proof)).withStatusHint(parseProofStatusHint(status));
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProofs(
    stateIds: readonly StateId[],
    options?: IBatchRequestOptions,
  ): Promise<InclusionProofBatch> {
    if (stateIds.length < 1 || stateIds.length > BATCH_MAX_STATE_IDS) {
      throw new BatchProofError(
        'rejected',
        `Batch must contain 1..${BATCH_MAX_STATE_IDS} state ids, got ${stateIds.length}.`,
        { detail: 'state_count' },
      );
    }
    const ids = stateIds.map((id) => HexConverter.encode(id.data));
    if (new Set(ids).size !== ids.length) {
      throw new BatchProofError('rejected', 'Batch state ids must be distinct.', { detail: 'duplicate_state_id' });
    }
    const exact = options?.stateRoot !== undefined;
    // the roots of the state trees are SHA-256 hashes: another algorithm is a caller error, not a lookup that misses
    if (exact && (options.stateRoot?.algorithm !== HashAlgorithm.SHA256 || options.stateRoot.data.length !== 32)) {
      throw new BatchProofError('rejected', 'stateRoot must be a 32-byte SHA-256 hash.', {
        detail: 'invalid_state_root',
      });
    }

    let result: unknown;
    try {
      result = await this.transport.request(
        'get_inclusion_proofs.v1',
        { stateIds: ids, stateRoot: exact ? HexConverter.encode(options.stateRoot?.data) : 'latest' },
        new Headers(),
        options,
      );
    } catch (e) {
      throw AggregatorClient.batchFailure(e, options);
    }

    return AggregatorClient.decodeBatch(result, ids.length, exact);
  }

  /**
   * Query the aggregator's latest block number.
   *
   * @returns {Promise<bigint>} Latest block number.
   * @throws {Error} If the response does not contain a numeric `blockNumber`.
   */
  public async getLatestBlockNumber(): Promise<bigint> {
    const response = await this.transport.request('get_block_height', {});
    if (
      response &&
      typeof response === 'object' &&
      'blockNumber' in response &&
      (typeof response.blockNumber === 'string' ||
        typeof response.blockNumber === 'number' ||
        typeof response.blockNumber === 'bigint')
    ) {
      return BigInt(response.blockNumber);
    }
    throw new Error('Invalid response format for block height');
  }

  /**
   * @inheritDoc
   */
  public async submitCertificationRequest(
    certificationData: CertificationData,
    options?: IRequestOptions,
  ): Promise<CertificationResponse> {
    const request = await CertificationRequest.create(certificationData);

    const headers = new Headers([['X-State-ID', HexConverter.encode(request.stateId.data)]]);
    if (this.#key) {
      headers.set('X-API-Key', this.#key);
    }

    let response: unknown;
    try {
      response = await this.transport.request(
        'certification_request',
        HexConverter.encode(request.toCBOR()),
        headers,
        options,
      );
    } catch (e) {
      // The Mongo backed queue rejects a second request for a state id by its unique state id index, and the server
      // reports that as an internal error naming the duplicate key. That says a request for this state id is queued,
      // not that it is THIS request (a different transaction for the same state is rejected the same way), so the
      // submission is not reported as accepted: the caller waits for the proof and compares it. A server that compares
      // the queued request answers ALREADY_SUBMITTED explicitly.
      if (AggregatorClient.isDuplicateSubmission(e)) {
        return CertificationResponse.create(CertificationStatus.STATE_ID_QUEUED);
      }
      throw e;
    }

    return CertificationResponse.fromJSON(response);
  }
}
