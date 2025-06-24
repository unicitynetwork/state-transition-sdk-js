import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';

import { BurnPredicate } from './BurnPredicate.js';
import { IPredicate } from './IPredicate.js';
import { IPredicateFactory } from './IPredicateFactory.js';
import { MaskedPredicate } from './MaskedPredicate.js';
import { PredicateType } from './PredicateType.js';
import { UnmaskedPredicate } from './UnmaskedPredicate.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

/**
 * Default implementation of {@link IPredicateFactory}.
 */
export class PredicateCborFactory implements IPredicateFactory {
  /**
   * @inheritDoc
   */
  public create(tokenId: TokenId, tokenType: TokenType, bytes: Uint8Array): Promise<IPredicate> {
    const data = CborDecoder.readArray(bytes);
    const type = CborDecoder.readTextString(data[0]);
    switch (type) {
      case PredicateType.BURN:
        return BurnPredicate.fromCBOR(tokenId, tokenType, bytes);
      case PredicateType.MASKED:
        return MaskedPredicate.fromCBOR(tokenId, tokenType, bytes);
      case PredicateType.UNMASKED:
        return UnmaskedPredicate.fromCBOR(tokenId, tokenType, bytes);
      default:
        throw new Error(`Unknown predicate type: ${type}`);
    }
  }
}
