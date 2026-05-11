import { readFileSync } from 'fs';
import { parentPort } from 'node:worker_threads';

import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { PredicateVerifierService } from '../../../../src/predicate/verification/PredicateVerifierService.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Token } from '../../../../src/transaction/Token.js';
import { MintJustificationVerifierService } from '../../../../src/transaction/verification/MintJustificationVerifierService.js';

interface IInitMessage {
  readonly trustBasePath: string;
  readonly type: 'init';
}

interface IMintMessage {
  readonly id: number;
  readonly inclusionProofCbor: Uint8Array;
  readonly mintTransactionCbor: Uint8Array;
  readonly type: 'mint';
}

type WorkerMessage = IInitMessage | IMintMessage;

let trustBase: RootTrustBase;
let predicateVerifier: PredicateVerifierService;
const mintJustificationVerifier = new MintJustificationVerifierService();

async function handleMessage(msg: WorkerMessage): Promise<void> {
  try {
    switch (msg.type) {
      case 'init': {
        const json: unknown = JSON.parse(readFileSync(msg.trustBasePath, 'utf-8'));
        trustBase = RootTrustBase.fromJSON(json);
        predicateVerifier = PredicateVerifierService.create();
        parentPort!.postMessage({ type: 'init-ok' });
        break;
      }
      case 'mint': {
        const mintTransaction = await MintTransaction.fromCBOR(new Uint8Array(msg.mintTransactionCbor));
        const inclusionProof = InclusionProof.fromCBOR(new Uint8Array(msg.inclusionProofCbor));
        const certifiedTransaction = await mintTransaction.toCertifiedTransaction(
          trustBase,
          predicateVerifier,
          inclusionProof,
        );
        await Token.mint(trustBase, predicateVerifier, mintJustificationVerifier, certifiedTransaction);
        parentPort!.postMessage({ id: msg.id, success: true, type: 'mint-result' });
        break;
      }
    }
  } catch (e) {
    if (msg.type === 'init') {
      parentPort!.postMessage({ error: (e as Error).message, type: 'init-error' });
    } else if (msg.type === 'mint') {
      parentPort!.postMessage({
        error: (e as Error).message,
        id: msg.id,
        success: false,
        type: 'mint-result',
      });
    }
  }
}

parentPort!.on('message', (msg: WorkerMessage): void => {
  void handleMessage(msg);
});
