import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { IPredicateFactory } from '../../predicate/IPredicateFactory.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenState } from '../../token/TokenState.js';
import { TokenType } from '../../token/TokenType.js';
import { ITransactionJson, Transaction } from '../../transaction/Transaction.js';
import { ITransactionDataJson, TransactionData } from '../../transaction/TransactionData.js';

export class TransactionJsonDeserializer {
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    { data, inclusionProof }: ITransactionJson<ITransactionDataJson>,
  ): Promise<Transaction<TransactionData>> {
    return new Transaction(
      await TransactionData.create(
        await TokenState.create(
          await this.predicateFactory.create(tokenId, tokenType, data.sourceState.unlockPredicate),
          data.sourceState.data ? HexConverter.decode(data.sourceState.data) : null,
        ),
        data.recipient,
        HexConverter.decode(data.salt),
        data.dataHash ? DataHash.fromJSON(data.dataHash) : null,
        data.message ? HexConverter.decode(data.message) : null,
        [], //await Promise.all(data.nameTags.map((input) => this.importToken(input, NameTagTokenData, predicateFactory))),
      ),
      InclusionProof.fromJSON(inclusionProof),
    );
  }
}
