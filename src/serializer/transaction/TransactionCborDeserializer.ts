import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { IPredicateFactory } from '../../predicate/IPredicateFactory.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenState } from '../../token/TokenState.js';
import { TokenType } from '../../token/TokenType.js';
import { Transaction } from '../../transaction/Transaction.js';
import { TransactionData } from '../../transaction/TransactionData.js';

export class TransactionCborDeserializer {
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    bytes: Uint8Array,
  ): Promise<Transaction<TransactionData>> {
    const transaction = CborDecoder.readArray(bytes);
    const data = CborDecoder.readArray(transaction[0]);
    const state = CborDecoder.readArray(data[0]);

    return new Transaction(
      await TransactionData.create(
        await TokenState.create(
          await this.predicateFactory.create(tokenId, tokenType, state[0]),
          CborDecoder.readOptional(state[1], CborDecoder.readByteString),
        ),
        CborDecoder.readTextString(data[1]),
        CborDecoder.readByteString(data[2]),
        CborDecoder.readOptional(data[3], DataHash.fromCBOR),
        CborDecoder.readOptional(data[4], CborDecoder.readByteString),
        [],
      ),
      InclusionProof.fromCBOR(transaction[1]),
    );
  }
}
