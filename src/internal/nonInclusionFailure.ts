import { JsonRpcDataError } from '../api/json-rpc/JsonRpcDataError.js';
import { JsonRpcNetworkError } from '../api/json-rpc/JsonRpcNetworkError.js';
import { JsonRpcResponseError } from '../api/json-rpc/JsonRpcResponseError.js';
import { NonInclusionProofError } from '../api/NonInclusionProofError.js';

/** A failure of `get_non_inclusion_proof.v1` or `null` for the service's claim that the state is included. */
export function classifyNonInclusionFailure(e: unknown, signal?: AbortSignal): NonInclusionProofError | null {
  if (NonInclusionProofError.is(e)) {
    return e;
  }
  // the caller's cancellation or deadline: its own reason is the cause
  const named = (x: unknown, name: string): boolean =>
    typeof x === 'object' && x !== null && 'name' in x && x.name === name;
  if (signal?.aborted || named(e, 'AbortError') || named(e, 'TimeoutError') || named(e, 'SleepError')) {
    let reason: unknown = e;
    if (signal?.aborted) {
      reason = signal.reason;
    } else if (named(e, 'SleepError') && typeof e === 'object' && e !== null && 'cause' in e) {
      reason = e.cause;
    }
    return named(reason, 'TimeoutError')
      ? new NonInclusionProofError('timeout', 'The deadline of the request expired.', {
          cause: reason,
          retryable: true,
        })
      : new NonInclusionProofError('cancelled', 'The request was cancelled.', { cause: reason });
  }
  if (e instanceof JsonRpcDataError) {
    // a code in an envelope that did not carry our request id answers nothing
    if (!e.idMatched) {
      return new NonInclusionProofError('invalid_response', 'JSON-RPC error without the request id.', { cause: e });
    }
    switch (e.code) {
      case -32020: // no certified snapshot yet
        return new NonInclusionProofError('unavailable', e.message, { cause: e, code: e.code, retryable: true });
      case -32022: // the claim, not an error: see getNonInclusionProof
        return null;
      case -32023: // proof admission limit
        return new NonInclusionProofError('busy', e.message, { cause: e, code: e.code, retryable: true });
      case -32600:
      case -32601:
      case -32602:
        return new NonInclusionProofError('rejected', e.message, { cause: e, code: e.code });
      default: // internal and unknown codes are kept, not interpreted
        return new NonInclusionProofError('server', e.message, { cause: e, code: e.code });
    }
  }
  if (e instanceof JsonRpcResponseError) {
    return new NonInclusionProofError('invalid_response', e.message, { cause: e });
  }
  if (e instanceof JsonRpcNetworkError) {
    // the service's own error survives any HTTP status; a body that is not a matching envelope is transport
    return e.rpcError
      ? classifyNonInclusionFailure(e.rpcError, signal)
      : new NonInclusionProofError('transport', `HTTP ${e.status}`, { cause: e, retryable: true });
  }
  return new NonInclusionProofError('transport', e instanceof Error ? e.message : String(e), {
    cause: e,
    retryable: true,
  });
}
