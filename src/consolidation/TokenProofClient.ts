import { ConsolidationError } from './ConsolidationError.js';
import { ConsolidationResult, IProofSummary } from './ConsolidationResult.js';
import {
  AttemptClock,
  IConsolidationItem,
  IConsolidationOptions,
  ProofConsolidator,
  validateConsolidationOptions,
} from './ProofConsolidator.js';
import { ShardRouting } from './ShardRouting.js';
import { ShardId } from '../api/bft/ShardId.js';
import { SealVerificationSession } from '../api/bft/verification/SealVerificationSession.js';
import { ILongPollOptions } from '../api/ILongPollOptions.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { scopedVerificationContext } from '../internal/OperationContext.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Token } from '../transaction/Token.js';
import { IVerificationContext } from '../transaction/verification/IVerificationContext.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

/**
 * Configuration of a {@link TokenProofClient}.
 */
export interface ITokenProofClientOptions {
  /** Maximum number of completed seal checks one operation remembers. Default 64. */
  readonly maxSealCacheEntries?: number;
  /** Trusted shard routing, configured once. Endpoints and credentials come from here only. */
  readonly routing: ShardRouting;
  /**
   * The existing verification context: its trust base is the anchored authority and its predicate, issuance and
   * certificate verification are what decide, as injected (custom signature verifiers, rules and caches included). A
   * stock verifier is shared through an operation scoped seal session whose misses its own quorum rule decides; a
   * customized verifier or rule verifies every proof by itself.
   */
  readonly verificationContext: IVerificationContext;
}

/**
 * Options of one {@link TokenProofClient.consolidate} call.
 */
export interface ITokenConsolidationOptions {
  /**
   * Diagnostics and special cases. Ordinary callers never need them: the master is chosen for you (the shard of the
   * newest original proof, which is the one that can cover the history).
   */
  readonly advanced?: {
    /** Master shard to use instead; it must take part in the token's outer history. */
    readonly master?: ShardId;
  };
  /**
   * Opt in to one long poll on the master shard's latest request (`true`, or `{ windowMs, marginMs }`); see
   * {@link IConsolidationOptions.masterLongPoll}. The other shards' exact-root requests never wait and the attempt is not
   * repeated.
   */
  readonly masterLongPoll?: boolean | ILongPollOptions;
  /** Upper bound on concurrent exact-root requests of the second wave. Default 4. */
  readonly maxParallel?: number;
  /**
   * Cancels the attempt and every outstanding request. The error is `cancelled` with `cause === signal.reason`; a
   * signal that aborts with a `TimeoutError` (`AbortSignal.timeout`) is reported as `timeout`.
   */
  readonly signal?: AbortSignal;
  /** Total deadline of the whole operation in milliseconds, 1..2^31-1. Default 10 000. */
  readonly timeoutMs?: number;
}

/**
 * Explicit preparation of a token for verification by an EVM contract (including internal bridge back) or a zkVM:
 * returns an ordinary token whose replaceable outer-history proofs all share one unicity seal, so that the target
 * verifier authenticates that seal once.
 *
 * Consolidation is optional and never automatic: nothing in the SDK calls this class. It needs no signing key, never
 * submits anything and never modifies its input. Proofs inside signed mint justifications, split/burn dependencies
 * and opaque predicate data are not replaceable and stay byte-for-byte unchanged, so a token with nested proofs can
 * still need other seals; the one-seal claim is about the outer history only. The token's size does not shrink.
 */
export class TokenProofClient {
  /**
   * @param {ITokenProofClientOptions} options Configuration. The network is the one of the verification context's
   *   trust base, the routing carries none.
   */
  public constructor(private readonly options: ITokenProofClientOptions) {}

  private static distinctSeals(proofs: readonly InclusionProof[]): number {
    const seals: Uint8Array[] = [];
    for (const proof of proofs) {
      const seal = proof.unicityCertificate.unicitySeal.toCBOR();
      if (!seals.some((known) => areUint8ArraysEqual(known, seal))) {
        seals.push(seal);
      }
    }
    return seals.length;
  }

  /**
   * Token bytes with the proofs of the outer history swapped. Every other byte (signed transactions, mint
   * justifications and their nested proofs, predicates) is copied verbatim; the result is only ever used by decoding
   * it into a token that is then fully verified.
   */
  private static replaceOuterProofs(tokenBytes: Uint8Array, proofs: readonly InclusionProof[]): Uint8Array {
    const tag = CborDeserializer.decodeTag(tokenBytes);
    const [version, genesis, transfers] = CborDeserializer.decodeArray(tag.data, 3);
    const transferItems = CborDeserializer.decodeArray(transfers);
    if (proofs.length !== transferItems.length + 1) {
      throw new ConsolidationError('integrity', 'Proof count does not match the token history.', {
        outcome: 'invalid_input',
      });
    }
    const swap = (certified: Uint8Array, proof: InclusionProof): Uint8Array => {
      const [transaction] = CborDeserializer.decodeArray(certified, 2);
      return CborSerializer.encodeArray(transaction, proof.toCBOR());
    };
    return CborSerializer.encodeTag(
      tag.tag,
      CborSerializer.encodeArray(
        version,
        swap(genesis, proofs[0]),
        CborSerializer.encodeArray(...transferItems.map((item, i) => swap(item, proofs[i + 1]))),
      ),
    );
  }

  /**
   * Rebuild the token's outer-history proofs under one master seal.
   *
   * One attempt makes one `latest` request to the master shard and one exact-root request to every other
   * participating shard (in parallel, bounded), under one total deadline. If the proofs already share a seal the
   * verified token is returned without any request.
   *
   * @param {Token} token Token to prepare, unchanged on every outcome.
   * @param {ITokenConsolidationOptions} [options] Deadline, cancellation and bounds.
   * @returns {Promise<ConsolidationResult>} `consolidated` with a fully verified immutable token, or `unavailable`
   *   with a stable reason when the service cannot provide the material.
   * @throws {ConsolidationError} Typed cancellation, deadline, transport, server, response or integrity failure.
   */
  public async consolidate(token: Token, options: ITokenConsolidationOptions = {}): Promise<ConsolidationResult> {
    const attemptOptions: IConsolidationOptions = {
      master: options.advanced?.master,
      masterLongPoll: options.masterLongPoll,
      maxParallel: options.maxParallel,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    };
    validateConsolidationOptions(attemptOptions);
    // one deadline and one cancellation for the whole operation: the checks before and after the requests as well
    const timeoutMs = options.timeoutMs ?? ProofConsolidator.DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    const clock = new AttemptClock(timeoutMs, options.signal);
    try {
      clock.throwIfDone();
      return await this.run(token, options, clock, () => Math.max(1, timeoutMs - (Date.now() - started)));
    } catch (e) {
      // a deadline or cancellation that surfaced as anything else (an aborted request) is reported as what it was
      const done = clock.done();
      if (done && !(e instanceof ConsolidationError && e.kind !== 'cancelled' && e.kind !== 'timeout')) {
        throw done;
      }
      throw e;
    } finally {
      clock.dispose();
    }
  }

  /** Verification context of one operation: the caller's, with a stock verifier scoped to the operation and session. */
  private operationContext(session: SealVerificationSession): IVerificationContext {
    const context = this.options.verificationContext;
    const scoped = context.unicityCertificateVerifier.beginOperation(session);
    return scoped === context.unicityCertificateVerifier ? context : scopedVerificationContext(context, scoped);
  }

  private async run(
    token: Token,
    options: ITokenConsolidationOptions,
    clock: AttemptClock,
    remainingMs: () => number,
  ): Promise<ConsolidationResult> {
    const callerContext = this.options.verificationContext;
    const { trustBase } = callerContext;
    // the caller's verification is what is shared and what decides: its quorum rule (signature verifier, cache) backs
    // the session, and a customized verifier or rule keeps verifying by itself under the caller's own context
    const verifier = callerContext.unicityCertificateVerifier;
    const rule = verifier.quorumRule;
    const session = new SealVerificationSession(trustBase, rule, { maxEntries: this.options.maxSealCacheEntries });
    // a stock verifier becomes this operation, sharing the strict session; a customized one returns itself
    const context = this.operationContext(session);

    const original = await token.verify(context);
    clock.throwIfDone();
    if (original.status !== VerificationStatus.OK) {
      throw new ConsolidationError('integrity', 'The token does not verify.', {
        cause: original,
        outcome: 'invalid_input',
      });
    }

    const outer = [token.genesis, ...token.transactions];
    const items: IConsolidationItem[] = outer.map((transaction) => ({
      certificationData: transaction.inclusionProof.certificationData,
      proof: transaction.inclusionProof,
    }));
    const originalSeals = TokenProofClient.distinctSeals(items.map((item) => item.proof));
    const evidenceQuorumChecks = session.stats.quorumChecks;

    if (originalSeals === 1) {
      return {
        status: 'consolidated',
        summary: {
          alreadyConsolidated: true,
          consolidatedSeals: 1,
          evidenceQuorumChecks,
          masterRound: items[0].proof.unicityCertificate.unicitySeal.rootChainRoundNumber,
          masterShard: items[0].proof.unicityCertificate.shardTreeCertificate.shard,
          originalSeals,
          outerProofs: items.length,
          quorumChecks: 0,
          requests: 0,
          requiredRound: items[0].proof.unicityCertificate.unicitySeal.rootChainRoundNumber,
          shards: new Set(items.map((i) => i.proof.unicityCertificate.shardTreeCertificate.shard.toString())).size,
        },
        token,
      };
    }

    const attempt = await new ProofConsolidator(this.options.routing, session).consolidate(items, {
      master: options.advanced?.master,
      masterLongPoll: options.masterLongPoll,
      maxParallel: options.maxParallel,
      signal: clock.signal,
      timeoutMs: remainingMs(),
    });
    if (attempt.status === 'unavailable') {
      return {
        detail: attempt.detail,
        proofIndexes: attempt.proofIndexes,
        reason: attempt.reason,
        retryable: attempt.retryable,
        status: 'unavailable',
      };
    }

    // rebuild from the original signed bytes with only the replaceable proofs swapped, then verify everything again
    const proofs = attempt.responses.map((response) => response.inclusionProof as InclusionProof);
    const rebuilt = await Token.fromCBOR(TokenProofClient.replaceOuterProofs(token.toCBOR(), proofs));
    const result = await rebuilt.verify(context);
    clock.throwIfDone();
    if (result.status !== VerificationStatus.OK) {
      throw new ConsolidationError('integrity', 'The consolidated token does not verify.', {
        cause: result,
        outcome: 'invalid_input',
      });
    }

    const rebuiltOuter = [rebuilt.genesis, ...rebuilt.transactions].map((t) => t.inclusionProof);
    const consolidatedSeals = TokenProofClient.distinctSeals(rebuiltOuter);
    if (consolidatedSeals !== 1) {
      throw new ConsolidationError('integrity', 'The consolidated outer history does not share one seal.', {
        outcome: 'invalid_input',
      });
    }

    const summary: IProofSummary = {
      alreadyConsolidated: false,
      consolidatedSeals,
      evidenceQuorumChecks,
      masterRound: attempt.masterRound,
      masterShard: attempt.masterShard,
      originalSeals,
      outerProofs: items.length,
      quorumChecks: session.stats.quorumChecks - evidenceQuorumChecks,
      requests: attempt.requests,
      requiredRound: attempt.requiredRound,
      shards: attempt.shards,
    };
    return { status: 'consolidated', summary, token: rebuilt };
  }
}
