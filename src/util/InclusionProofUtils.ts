import { JsonRpcNetworkError } from '../api/json-rpc/JsonRpcNetworkError.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { StateTransitionClient } from '../StateTransitionClient.js';
import { Commitment } from '../transaction/Commitment.js';
import { InclusionProof, InclusionProofVerificationStatus } from '../transaction/InclusionProof.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { TransferTransactionData } from '../transaction/TransferTransactionData.js';

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
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function waitInclusionProof(
  trustBase: RootTrustBase,
  client: StateTransitionClient,
  commitment: Commitment<TransferTransactionData | MintTransactionData>,
  signal: AbortSignal = AbortSignal.timeout(10000),
  interval: number = 1000,
): Promise<InclusionProof> {
  while (true) {
    try {
      const inclusionProof = await client
        .getInclusionProof(commitment.requestId)
        .then((response) => response.inclusionProof);
      const verificationStatus = await inclusionProof.verify(trustBase, commitment.requestId);
      switch (verificationStatus) {
        case InclusionProofVerificationStatus.OK:
          return inclusionProof;
        case InclusionProofVerificationStatus.PATH_NOT_INCLUDED:
          break;
        default:
          throw new Error(`Invalid inclusion proof status: ${verificationStatus}`);
      }
    } catch (err) {
      if (!(err instanceof JsonRpcNetworkError && err.status === 404)) {
        throw err;
      }
    }

    try {
      await sleep(interval, signal);
    } catch (err) {
      throw new SleepError(String(err || 'Sleep was aborted'));
    }
  }
}
