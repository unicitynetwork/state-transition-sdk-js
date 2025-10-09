import { IMintTransactionDataJson } from './MintTransactionDataJsonSerializer.js';
import { ITransactionDataJson } from './TransactionDataJsonSerializer.js';
import { IInclusionProofJson } from '../../../transaction/InclusionProof.js';

/**
 * JSON representation of a transaction, which can either be a standard transaction or a mint transaction.
 * Contains the transaction data and an inclusion proof.
 */
export interface ITransactionJson<T extends ITransactionDataJson | IMintTransactionDataJson> {
  readonly data: T;
  readonly inclusionProof: IInclusionProofJson;
}
