import { InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DirectAddress } from '../address/DirectAddress.js';
import { ISerializable } from '../ISerializable.js';
import { MINTER_SECRET } from '../StateTransitionClient.js';
import { Token } from './Token.js';
import { BurnPredicate } from '../predicate/BurnPredicate.js';
import { PredicateType } from '../predicate/PredicateType.js';
import { ITokenSerializer } from '../serializer/token/ITokenSerializer.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { Transaction } from '../transaction/Transaction.js';
import { TransactionData } from '../transaction/TransactionData.js';
import { SplitMintReason } from './fungible/SplitMintReason.js';

/**
 * Utility for constructing tokens from their serialized form.
 */
export class TokenFactory {
  /**
   * @param deserializer token deserializer to use for parsing tokens from CBOR or JSON
   */
  public constructor(private readonly deserializer: ITokenSerializer) {}

  /**
   * Deserialize a token from JSON.
   *
   * @param data       Token JSON representation
   */
  public async create(data: unknown): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>> {
    const token = await this.deserializer.deserialize(data);

    if (!(await this.verifyMintTransaction(token.genesis))) {
      throw new Error('Mint transaction verification failed.');
    }

    let previousTransaction: Transaction<MintTransactionData<ISerializable | null> | TransactionData> = token.genesis;
    for (const transaction of token.transactions) {
      // TODO: Move address processing to a separate method
      const expectedRecipient = await DirectAddress.create(transaction.data.sourceState.unlockPredicate.reference);
      if (expectedRecipient.toJSON() !== previousTransaction.data.recipient) {
        throw new Error('Recipient address mismatch');
      }

      if (!(await previousTransaction.containsData(transaction.data.sourceState.data))) {
        throw new Error('State data is not part of transaction.');
      }

      if (!(await transaction.data.sourceState.unlockPredicate.verify(transaction))) {
        throw new Error('Predicate verification failed');
      }

      previousTransaction = transaction;
    }

    if (!(await previousTransaction.containsData(token.state.data))) {
      throw new Error('State data is not part of transaction.');
    }

    const expectedRecipient = await DirectAddress.create(token.state.unlockPredicate.reference);
    if (expectedRecipient.toJSON() !== previousTransaction.data.recipient) {
      throw new Error('Recipient address mismatch');
    }

    return token;
  }

  /**
   * Verify a mint transaction integrity and validate against public key.
   * @param transaction Mint transaction
   * @private
   */
  private async verifyMintTransaction(
    transaction: Transaction<MintTransactionData<ISerializable | null>>,
  ): Promise<boolean> {
    if (!transaction.inclusionProof.authenticator || !transaction.inclusionProof.transactionHash) {
      return false;
    }

    const signingService = await SigningService.createFromSecret(MINTER_SECRET, transaction.data.tokenId.bytes);

    if (
      HexConverter.encode(transaction.inclusionProof.authenticator.publicKey) !==
        HexConverter.encode(signingService.publicKey) ||
      !transaction.inclusionProof.authenticator.stateHash.equals(transaction.data.sourceState.hash)
    ) {
      return false; // input mismatch
    }

    // Verify if transaction data is valid.
    if (!(await transaction.inclusionProof.authenticator.verify(transaction.data.hash))) {
      return false;
    }

    const reason = transaction.data.reason;
    if (reason instanceof SplitMintReason) {
      if (transaction.data.coinData == null) {
        return false;
      }

      if (reason.token.state.unlockPredicate.type != PredicateType.BURN) {
        return false;
      }

      const coins = new Map(
        transaction.data.coinData?.coins.map(([id, value]) => [id.toBitString().toBigInt(), value]) ?? [],
      );

      if (coins?.size !== reason.proofs.size) {
        return false;
      }

      for (const [coinId, proof] of reason.proofs) {
        const aggregationPathResult = await proof.aggregationPath.verify(coinId);
        if (!aggregationPathResult.result) {
          return false;
        }

        const coinPathResult = await proof.coinTreePath.verify(transaction.data.tokenId.toBitString().toBigInt());
        if (!coinPathResult.result) {
          return false;
        }

        const aggregationPathLeaf = proof.aggregationPath.steps.at(0)?.branch?.value;
        if (!aggregationPathLeaf || !proof.coinTreePath.root.equals(DataHash.fromImprint(aggregationPathLeaf))) {
          return false;
        }

        const sumPathLeaf = proof.coinTreePath.steps.at(0)?.branch?.sum;
        if (coins.get(coinId) !== sumPathLeaf) {
          return false;
        }

        const predicate = reason.token.state.unlockPredicate as BurnPredicate;
        if (!proof.aggregationPath.root.equals(predicate.reason)) {
          return false;
        }
      }
    }

    // Verify inclusion proof path.
    const requestId = await RequestId.create(signingService.publicKey, transaction.data.sourceState.hash);
    const status = await transaction.inclusionProof.verify(requestId);
    return status === InclusionProofVerificationStatus.OK;
  }
}
