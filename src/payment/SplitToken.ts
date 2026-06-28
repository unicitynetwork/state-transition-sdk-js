import { IPaymentData } from './IPaymentData.js';
import { SplitAllocationProof } from './SplitAllocationProof.js';
import { NetworkId } from '../api/NetworkId.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { TokenSalt } from '../transaction/TokenSalt.js';
import { TokenType } from '../transaction/TokenType.js';

/**
 * Realized split output: everything needed to mint the new token. Mint it with
 * exactly `paymentData.encode()` as the auxiliary payload — those are the bytes
 * bound by the split allocation proofs.
 */
export class SplitToken {
  public constructor(
    public readonly networkId: NetworkId,
    public readonly recipient: IPredicate,
    public readonly tokenType: TokenType,
    public readonly salt: TokenSalt,
    public readonly paymentData: IPaymentData,
    public readonly proofs: SplitAllocationProof[],
  ) {}
}
