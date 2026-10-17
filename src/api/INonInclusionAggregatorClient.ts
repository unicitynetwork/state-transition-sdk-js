import { IAggregatorClient } from './IAggregatorClient.js';
import { InclusionProof } from './InclusionProof.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { IRequestOptions } from './IRequestOptions.js';
import { NonInclusionProof } from './NonInclusionProof.js';
import { NonInclusionProofError } from './NonInclusionProofError.js';
import { StateId } from './StateId.js';
import { abortable } from '../internal/abortable.js';
import { classifyNonInclusionFailure } from '../internal/nonInclusionFailure.js';

/**
 * What the service answered to a non-inclusion request.
 *
 * - `absence_proof`: material that *claims* absence at a snapshot. It is not evidence until `verifyNonInclusion`
 *   accepts it.
 * - `state_included_hint`: the service says the state is certified at the root it selected (`-32022`). This is an
 *   **unauthenticated claim**, not inclusion evidence and not a proof of anything; ask for an inclusion proof and verify
 *   that.
 */
export type NonInclusionProofResponse =
  { readonly kind: 'absence_proof'; readonly proof: NonInclusionProof } | { readonly kind: 'state_included_hint' };

/**
 * Optional capability of an aggregator client: `get_non_inclusion_proof.v1`.
 *
 * Separate from {@link IAggregatorClient}, which is unchanged: custom transports and test doubles need not implement it.
 */
export interface INonInclusionAggregatorClient extends IAggregatorClient {
  /**
   * One call, no polling and no retry. The proof is bound to `stateId` locally (the wire does not carry it) and is
   * served from the latest certified snapshot of the service; it proves absence **at that snapshot**, not now. The
   * signal ends the call even if the transport ignores it, and `cause` of the error is then `signal.reason`.
   *
   * @param {StateId} stateId The state asked about.
   * @param {IRequestOptions} [options] Abort signal.
   * @returns {Promise<NonInclusionProofResponse>} The unverified proof, or the service's claim that the state is included.
   * @throws {NonInclusionProofError} Typed service, transport, response or cancellation failure.
   */
  getNonInclusionProof(stateId: StateId, options?: IRequestOptions): Promise<NonInclusionProofResponse>;
}

/**
 * @param {IAggregatorClient} client Any aggregator client.
 * @returns {boolean} True if the client implements the non-inclusion capability.
 */
export function isNonInclusionAggregatorClient(client: IAggregatorClient): client is INonInclusionAggregatorClient {
  return typeof (client as Partial<INonInclusionAggregatorClient>).getNonInclusionProof === 'function';
}

/**
 * Unverified material about one state. Neither form is evidence until verified: an inclusion proof with the inclusion
 * rules, an absence proof with `verifyNonInclusion`.
 */
export type MembershipEvidence =
  | { readonly kind: 'absence'; readonly proof: NonInclusionProof }
  | { readonly kind: 'inclusion'; readonly proof: InclusionProof };

/**
 * Ask for absence, and for the inclusion proof if the service says the state is included. **Two independent calls, not
 * atomic**: they may be served from different snapshots, and both results are unverified evidence.
 *
 * @param {INonInclusionAggregatorClient} client Client with the non-inclusion capability.
 * @param {StateId} stateId The state.
 * @param {IRequestOptions} [options] Abort signal, used for both calls.
 * @returns {Promise<MembershipEvidence>} Unverified evidence.
 * @throws {NonInclusionProofError} Every failure of either call, typed like `getNonInclusionProof`'s (a cancellation with
 *   `cause = signal.reason`); a service that claimed inclusion and has no inclusion proof yet is `unavailable`, retryable
 *   (the calls are not atomic and may see different snapshots).
 */
export async function fetchMembershipEvidence(
  client: INonInclusionAggregatorClient,
  stateId: StateId,
  options?: IRequestOptions,
): Promise<MembershipEvidence> {
  const answer = await client.getNonInclusionProof(stateId, options);
  if (answer.kind === 'absence_proof') {
    return { kind: 'absence', proof: answer.proof };
  }
  // the second call is bounded by the same signal, and its failures are typed like the first call's
  const signal = options?.signal;
  let included: InclusionProofResponse;
  try {
    included = await (signal
      ? abortable((s) => client.getInclusionProof(stateId, { ...options, signal: s }), signal)
      : client.getInclusionProof(stateId, options));
  } catch (e) {
    throw classifyNonInclusionFailure(e, signal) ?? e;
  }
  if (!included.inclusionProof) {
    throw new NonInclusionProofError(
      'unavailable',
      'The service claimed the state is included, but no inclusion proof is available yet.',
      { retryable: true },
    );
  }
  return { kind: 'inclusion', proof: included.inclusionProof };
}
