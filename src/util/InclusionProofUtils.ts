import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { JsonRpcNetworkError } from '../api/json-rpc/JsonRpcNetworkError.js';
import { StateId } from '../api/StateId.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../StateTransitionClient.js';
import { ITransaction } from '../transaction/ITransaction.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../transaction/verification/rule/InclusionProofVerificationRule.js';

class SleepError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SleepError';
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

export async function waitInclusionProof(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  transaction: ITransaction,
  signal: AbortSignal = AbortSignal.timeout(10000),
  interval: number = 1000,
): Promise<InclusionProof> {
  const stateId = await StateId.fromTransaction(transaction);
  while (true) {
    try {
      const inclusionProof = await client.getInclusionProof(stateId).then((response) => response.inclusionProof);
      const verificationStatus = await InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        inclusionProof,
        transaction,
      );

      console.log(stateId.toString(), verificationStatus);
      switch (verificationStatus.status) {
        case InclusionProofVerificationStatus.OK:
          return inclusionProof;
        case InclusionProofVerificationStatus.PATH_NOT_INCLUDED:
          break;
        default:
          throw new Error(`Invalid inclusion proof status: ${verificationStatus.status}`);
      }
    } catch (err) {
      if (!(err instanceof JsonRpcNetworkError && err.status === 404)) {
        throw err;
      }
    }

    try {
      await sleep(interval, signal);
    } catch (err) {
      throw new SleepError(err?.toString() || 'Sleep was aborted');
    }
  }
}
