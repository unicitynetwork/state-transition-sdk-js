import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';
import { SplitAssetProof } from './SplitAssetProof.js';
import { NetworkId } from '../api/NetworkId.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { TokenSalt } from '../transaction/TokenSalt.js';
import { TokenType } from '../transaction/TokenType.js';

/**
 * Realized split output: all data needed to mint the new token.
 */
export class SplitToken {
  public constructor(
    public readonly networkId: NetworkId,
    public readonly recipient: IPredicate,
    public readonly tokenType: TokenType,
    public readonly salt: TokenSalt,
    public readonly assets: PaymentAssetCollection,
    public readonly proofs: SplitAssetProof[],
  ) {}
}
