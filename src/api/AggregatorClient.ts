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
import { INonInclusionAggregatorClient, NonInclusionProofResponse } from './INonInclusionAggregatorClient.js';
import { IInclusionProofRequestOptions, IRequestOptions } from './IRequestOptions.js';
import { ITrustBaseRequest, ITrustBaseSource } from './ITrustBaseSource.js';
import { JsonRpcDataError } from './json-rpc/JsonRpcDataError.js';
import { JsonRpcHttpTransport } from './json-rpc/JsonRpcHttpTransport.js';
import { JsonRpcNetworkError } from './json-rpc/JsonRpcNetworkError.js';
import { JsonRpcResponseError } from './json-rpc/JsonRpcResponseError.js';
import { readBoundedBytes } from './json-rpc/readBoundedBytes.js';
import { NonInclusionProof } from './NonInclusionProof.js';
import { NonInclusionProofError } from './NonInclusionProofError.js';
import { parseProofStatusHint } from './ProofStatusHint.js';
import { StateId } from './StateId.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { abortable } from '../internal/abortable.js';
import { checkWaitMs, isMalformedParams, isWireMilliseconds } from '../internal/longPoll.js';
import { classifyNonInclusionFailure } from '../internal/nonInclusionFailure.js';
import { SDK_VERSION } from '../SdkVersion.js';
import { HexConverter } from '../util/HexConverter.js';

/** What a batch call sent: the HTTP requests it took so far and the `waitMs` of the one in flight, if any. */
interface IBatchSend {
  readonly requests: 1 | 2;
  readonly waitMs: number | undefined;
}

/** Name of the request header that carries the SDK version, so an aggregator operator can count how many clients run which version. */
export const SDK_VERSION_HEADER = 'X-SDK-Version';

/** Options of {@link AggregatorClient}. */
export interface IAggregatorClientOptions {
  /**
   * The SDK version header on every request. `true` sends `js/<package version>`, a string sends that value, `false` sends nothing.
   * Default: on outside a browser, off in a browser (a custom header makes the request subject to a CORS preflight that the aggregator has to
   * allow). Never used as a retry fallback.
   */
  readonly sdkVersionHeader?: boolean | string;
}

/**
 * Client implementation for communicating with an aggregator via JSON-RPC.
 */
export class AggregatorClient
  implements IAggregatorClient, IBatchAggregatorClient, INonInclusionAggregatorClient, ITrustBaseSource
{
  /** Largest trust-base response read: the GetTrustBase page cap plus slack for the HTTP framing. */
  public static readonly MAX_TRUST_BASE_RESPONSE_BYTES = (1 << 20) + 1024;

  private readonly transport: JsonRpcHttpTransport;
  private readonly url: string;
  private readonly versionHeader: string | null;
  readonly #key: string | null;

  /**
   * Create a new client pointing to the given aggregator URL.
   *
   * @param url Base URL of the aggregator JSON-RPC endpoint
   * @param key API key for authenticating
   * @param allowInsecureTransport When `true`, permit sending the API key over a non-HTTPS URL
   *   (intended for local development and testing only).
   * @param options Client options, e.g. the SDK version header.
   * @throws {Error} If an API key is supplied for a non-HTTPS URL and `allowInsecureTransport` is `false`.
   */
  public constructor(
    url: string,
    key: string | null = null,
    allowInsecureTransport: boolean = false,
    options: IAggregatorClientOptions = {},
  ) {
    if (key != null && !allowInsecureTransport && new URL(url).protocol !== 'https:') {
      throw new Error('API key must not be sent over plaintext HTTP; use an https URL.');
    }

    this.#key = key;
    this.url = url;
    const version = AggregatorClient.versionHeaderValue(options.sdkVersionHeader);
    this.versionHeader = version;
    this.transport = new JsonRpcHttpTransport(
      url,
      JsonRpcHttpTransport.DEFAULT_MAX_RESPONSE_BYTES,
      version === null ? [] : [[SDK_VERSION_HEADER, version]],
    );
  }

  private static batchFailure(e: unknown, options: IBatchRequestOptions | undefined, sent: IBatchSend): unknown {
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
    const { requests } = sent;
    if (e instanceof JsonRpcDataError) {
      return AggregatorClient.rpcFailure(e, sent);
    }
    if (e instanceof JsonRpcResponseError) {
      return new BatchProofError('invalid_response', e.message, { cause: e, requests });
    }
    if (e instanceof JsonRpcNetworkError) {
      return new BatchProofError('transport', `HTTP ${e.status}`, {
        cause: e,
        detail: `http_${e.status}`,
        requests,
        // the credential is missing or wrong: a new attempt with the same key cannot succeed
        retryable: e.status !== 401 && e.status !== 403,
      });
    }
    return new BatchProofError('transport', e instanceof Error ? e.message : String(e), {
      cause: e,
      requests,
      retryable: true,
    });
  }

  /** The validated `waitMs` of a batch call: a caller error is a `rejected` failure before anything is sent. */
  private static batchWait(options: IBatchRequestOptions | undefined, exact: boolean): number | undefined {
    if (options?.waitMs === undefined) {
      return undefined;
    }
    if (exact) {
      throw new BatchProofError(
        'rejected',
        'waitMs cannot be combined with stateRoot: an exact root is never waited on.',
        {
          detail: 'wait_with_state_root',
        },
      );
    }
    if (!isWireMilliseconds(options.waitMs)) {
      throw new BatchProofError('rejected', 'waitMs must be an integer in [0, Number.MAX_SAFE_INTEGER].', {
        detail: 'invalid_wait_ms',
      });
    }
    return options.waitMs;
  }

  private static decodeBatch(result: unknown, count: number, exact: boolean, sent: IBatchSend): InclusionProofBatch {
    const invalid = (message: string, cause?: unknown): BatchProofError =>
      new BatchProofError('invalid_response', message, { cause, requests: sent.requests });
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw invalid('Batch result must be an object.');
    }
    const body = result as Record<string, unknown>;
    // Unknown result fields are ignored (the service may add fields), never copied into trusted material: only the
    // known fields below are read, and they stay strictly validated.
    // the echo is a known field: admitted only as the answer to a request that asked for a wait
    if (body.waitedMs !== undefined && sent.waitMs === undefined) {
      throw invalid('Unexpected batch result field "waitedMs".');
    }
    if (body.waitedMs !== undefined && !isWireMilliseconds(body.waitedMs)) {
      throw invalid('Malformed waitedMs: it must be an integer in [0, Number.MAX_SAFE_INTEGER].');
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
      return new InclusionProofBatch(proofs, view, { requests: sent.requests, waitedMs: body.waitedMs ?? null });
    } catch (e) {
      throw invalid(`Malformed batch result: ${e instanceof Error ? e.message : String(e)}`, e);
    }
  }

  /**
   * Decode the proof of a received result. Any failure here, whatever its type or text, is the phase "the service sent
   * material that is not a proof": a malformed response, never a transport or RPC condition.
   */
  private static decodeInclusionProofResponse(hex: string): InclusionProofResponse {
    try {
      return InclusionProofResponse.fromCBOR(HexConverter.decode(hex));
    } catch (e) {
      throw new JsonRpcResponseError(
        `Malformed result of get_inclusion_proof.v2: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
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

  private static rpcFailure(e: JsonRpcDataError, sent: IBatchSend): BatchProofError {
    const data = typeof e.data === 'object' && e.data !== null ? (e.data as Record<string, unknown>) : {};
    const detail = typeof data.detail === 'string' ? data.detail : undefined;
    const retryable = data.retryable === true;
    const code = e.code;
    const { requests } = sent;
    // the echo of a request that asked for a wait; a malformed one is a protocol error, not metadata
    if (sent.waitMs !== undefined && data.waitedMs !== undefined && !isWireMilliseconds(data.waitedMs)) {
      return new BatchProofError('invalid_response', 'Malformed waitedMs in the error data.', { cause: e, requests });
    }
    const waitedMs = sent.waitMs !== undefined ? (data.waitedMs as number | undefined) : undefined;
    switch (code) {
      case -32008: // proof unavailable
        if (isBatchStateDetail(detail)) {
          // by the contract only a pending state is worth another attempt, whatever else the data says
          return new BatchProofError('unavailable', e.message, {
            code,
            detail,
            ...AggregatorClient.stateIndexes(data, detail),
            requests,
            retryable: detail === 'state_pending',
            waitedMs,
          });
        }
        return detail === 'unsupported_configuration'
          ? new BatchProofError('unsupported', e.message, { code, detail, requests, waitedMs })
          : new BatchProofError('unavailable', e.message, { code, detail, requests, retryable, waitedMs });
      case -32006: // concurrency limit: busy, with or without data
        return new BatchProofError('unavailable', e.message, {
          code,
          detail: detail ? `busy:${detail}` : 'busy',
          requests,
          retryable: true,
          waitedMs,
        });
      case -32601:
        return new BatchProofError('unsupported', e.message, { code, detail: 'method_not_found', requests });
      case -32602:
      case -32600:
        return new BatchProofError('rejected', e.message, { code, detail, requests, waitedMs });
      case -32007:
        return new BatchProofError('limit_exceeded', e.message, { code, detail, requests, waitedMs });
      default: // database, internal and unknown codes are operational failures, not unavailability
        return new BatchProofError('server', e.message, { code, detail, requests, retryable, waitedMs });
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

  private static versionHeaderValue(option: boolean | string | undefined): string | null {
    if (typeof option === 'string') {
      if (option === '' || !/^[\x20-\x7e]+$/.test(option)) {
        throw new Error('sdkVersionHeader must be printable ASCII.');
      }
      return option;
    }
    // Default on only where the runtime is known to have no CORS (Node, Bun, Deno). Browsers, web/shared/service
    // workers and any unknown runtime stay off: a refused preflight would fail every request, with no fallback.
    const g = globalThis as { Deno?: unknown; process?: { versions?: { node?: string } } };
    const noCors = g.process?.versions?.node !== undefined || g.Deno !== undefined;
    return (option ?? noCors) ? `js/${SDK_VERSION}` : null;
  }

  /**
   * @inheritDoc
   * @throws {JsonRpcResponseError} If the result cannot be decoded as a proof (not hex, not CBOR, malformed proof
   *   material): the original decoding error is kept as `cause`. Earlier releases threw that raw error (`CborError`,
   *   `HashError` or `Error`).
   */
  public async getInclusionProof(
    stateId: StateId,
    options?: IInclusionProofRequestOptions,
  ): Promise<InclusionProofResponse> {
    const waitMs = options?.waitMs === undefined ? undefined : checkWaitMs(options.waitMs);
    const data: { includeStatus?: true; stateId: string; waitMs?: number } = {
      stateId: HexConverter.encode(stateId.data),
    };
    if (options?.includeStatusHint === true) {
      data.includeStatus = true;
    }
    if (waitMs !== undefined) {
      data.waitMs = waitMs;
    }
    const result = await this.transport.request('get_inclusion_proof.v2', data, new Headers(), options);

    // a plain string is the legacy result (and the answer of a server that ignores the flags): no status, no echo
    if (typeof result === 'string') {
      return AggregatorClient.decodeInclusionProofResponse(result);
    }
    if (typeof result !== 'object' || result === null || typeof (result as { proof?: unknown }).proof !== 'string') {
      throw new JsonRpcResponseError('Unexpected result of get_inclusion_proof.v2.');
    }
    const { proof, status, waitedMs } = result as { proof: string; status?: unknown; waitedMs?: unknown };
    // the echo answers a wait request, nothing else, and is an integer or a protocol error
    if (waitedMs !== undefined && (waitMs === undefined || !isWireMilliseconds(waitedMs))) {
      throw new JsonRpcResponseError('Unexpected or malformed waitedMs in the result of get_inclusion_proof.v2.');
    }
    // an unrecognized status value is treated like no status at all
    return AggregatorClient.decodeInclusionProofResponse(proof)
      .withStatusHint(parseProofStatusHint(status))
      .withWaitedMs(waitedMs ?? null);
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

    const waitMs = AggregatorClient.batchWait(options, exact);
    const headers = new Headers();
    if (this.#key) {
      headers.set('X-API-Key', this.#key);
    }
    const request = (wait: number | undefined): Promise<unknown> =>
      this.transport.request(
        'get_inclusion_proofs.v1',
        wait === undefined
          ? { stateIds: ids, stateRoot: exact ? HexConverter.encode(options.stateRoot?.data) : 'latest' }
          : { stateIds: ids, stateRoot: 'latest', waitMs: wait },
        headers,
        options,
      );

    let sent: IBatchSend = { requests: 1, waitMs };
    let result: unknown;
    try {
      result = await request(waitMs);
    } catch (error) {
      // a gateway may carry the service's JSON-RPC error behind a non-2xx status (HTTP 400 for a batch across shards,
      // 503 for an overload): the envelope is classified as on HTTP 200
      const e = error instanceof JsonRpcNetworkError && error.rpcError ? error.rpcError : error;
      // A strict parser that does not know `waitMs` answers the generic malformed params without naming the field. Repeat
      // once without it, same other params and same signal (the deadline is the caller's, never renewed); the second
      // answer stands, whatever it is. Nothing is cached: the next call tries the wait again.
      if (
        waitMs === undefined ||
        !(e instanceof JsonRpcDataError) ||
        !e.idMatched ||
        !isMalformedParams(e.code, e.data)
      ) {
        throw AggregatorClient.batchFailure(e, options, sent);
      }
      sent = { requests: 2, waitMs: undefined };
      try {
        result = await request(undefined);
      } catch (retryFailure) {
        throw AggregatorClient.batchFailure(retryFailure, options, sent);
      }
    }

    return AggregatorClient.decodeBatch(result, ids.length, exact, sent);
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
  public async getNonInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<NonInclusionProofResponse> {
    const params = { stateId: HexConverter.encode(stateId.data) };
    let result: unknown;
    try {
      const call = (signal?: AbortSignal): Promise<unknown> =>
        this.transport.request('get_non_inclusion_proof.v1', params, new Headers(), { signal });
      // the request is raced against the signal: a transport that ignores it cannot outlive the caller's deadline
      result = options?.signal ? await abortable(call, options.signal) : await call();
    } catch (e) {
      const failure = classifyNonInclusionFailure(e, options?.signal);
      if (failure === null) {
        return { kind: 'state_included_hint' };
      }
      throw failure;
    }

    // the result is one hex string; its size is bounded before anything is decoded
    if (typeof result !== 'string' || result.length > NonInclusionProof.MAX_WIRE_BYTES * 2 + 2) {
      throw new NonInclusionProofError('invalid_response', 'The result must be a bounded hex string.');
    }
    try {
      return { kind: 'absence_proof', proof: NonInclusionProof.decode(stateId, HexConverter.decode(result)) };
    } catch (e) {
      throw new NonInclusionProofError(
        'invalid_response',
        `Malformed non-inclusion proof: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }

  /**
   * Fetch one page of signed trust-base entries: `GET /api/v1/trustbases?from=E[&snapshotEnd=E&snapshotEntryId=0x..]&maxEntries=N` on the
   * aggregator's origin, answered with the GetTrustBase response (tag 39015, `application/cbor`), whatever its status. The bytes are returned
   * undecoded: the aggregator is untrusted transport, the caller decodes them and appends each entry through the authenticated history.
   *
   * @param {ITrustBaseRequest} request The request.
   * @param {IRequestOptions} [options] Request options.
   * @returns {Promise<Uint8Array>} The encoded response.
   * @throws {JsonRpcNetworkError} On a non-success HTTP status (a malformed query is 400).
   * @throws {JsonRpcResponseError} When the body exceeds {@link AggregatorClient.MAX_TRUST_BASE_RESPONSE_BYTES}.
   */
  public async getTrustBasePage(request: ITrustBaseRequest, options?: IRequestOptions): Promise<Uint8Array> {
    // The trust-base endpoint is on the aggregator's origin, whatever path the JSON-RPC endpoint has.
    const url = new URL('/api/v1/trustbases', this.url);
    url.searchParams.set('from', request.fromEpoch.toString());
    url.searchParams.set('maxEntries', String(request.maxEntries));
    if (request.snapshot !== null) {
      url.searchParams.set('snapshotEnd', request.snapshot.end.toString());
      url.searchParams.set('snapshotEntryId', `0x${HexConverter.encode(request.snapshot.entryId)}`);
    }
    const headers = new Headers({ Accept: 'application/cbor' });
    if (this.versionHeader !== null) {
      headers.set(SDK_VERSION_HEADER, this.versionHeader);
    }
    if (this.#key) {
      headers.set('X-API-Key', this.#key);
    }
    const response = await fetch(url, { headers, method: 'GET', redirect: 'error', signal: options?.signal });
    const body = await readBoundedBytes(response, AggregatorClient.MAX_TRUST_BASE_RESPONSE_BYTES);
    if (!response.ok) {
      throw new JsonRpcNetworkError(response.status, new TextDecoder().decode(body));
    }
    return body;
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
