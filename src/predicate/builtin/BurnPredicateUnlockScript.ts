import { TransferTransaction } from '../../transaction/TransferTransaction.js';
import { IUnlockScript } from '../IUnlockScript.js';
import { BurnPredicate } from './BurnPredicate.js';

// TODO: Use null instead of empty unlock script.
export class BurnPredicateUnlockScript implements IUnlockScript {
  private constructor() {}

  public static create(transaction: TransferTransaction): BurnPredicateUnlockScript {
    if (!BurnPredicate.fromPredicate(transaction.lockScript)) {
      throw new Error('Transaction is not a burn transaction.');
    }

    return new BurnPredicateUnlockScript();
  }

  public encode(): Uint8Array {
    return new Uint8Array(0);
  }
}
