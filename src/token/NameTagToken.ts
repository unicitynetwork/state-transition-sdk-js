import { Token } from './Token.js';
import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { Transaction } from '../transaction/Transaction.js';

/**
 * Convenience alias describing a token used purely as a name tag.
 */
export type NameTagToken = Token<Transaction<MintTransactionData<ISerializable>>>;
