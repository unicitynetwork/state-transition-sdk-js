import { DirectAddress } from '../../../../src/address/DirectAddress.js';
import { DataHash } from '../../../../src/hash/DataHash.js';
import { DataHasher } from '../../../../src/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../src/hash/HashAlgorithm.js';
import { MerkleTreePath } from '../../../../src/mtree/plain/MerkleTreePath.js';
import { MaskedPredicate } from '../../../../src/predicate/MaskedPredicate.js';
import { PredicateCborFactory } from '../../../../src/predicate/PredicateCborFactory.js';
import { PredicateJsonFactory } from '../../../../src/predicate/PredicateJsonFactory.js';
import { TokenCborSerializer } from '../../../../src/serializer/cbor/token/TokenCborSerializer.js';
import { TokenJsonSerializer } from '../../../../src/serializer/json/token/TokenJsonSerializer.js';
import { SigningService } from '../../../../src/sign/SigningService.js';
import { Token, TOKEN_VERSION } from '../../../../src/token/Token.js';
import { TokenId } from '../../../../src/token/TokenId.js';
import { TokenState } from '../../../../src/token/TokenState.js';
import { TokenType } from '../../../../src/token/TokenType.js';
import { InclusionProof } from '../../../../src/transaction/InclusionProof.js';
import { MintTransactionData } from '../../../../src/transaction/MintTransactionData.js';
import { Transaction } from '../../../../src/transaction/Transaction.js';
import { TransactionData } from '../../../../src/transaction/TransactionData.js';

describe('TokenSerializers', () => {
  const textEncoder = new TextEncoder();

  it('serializes and deserializes a token correctly', async () => {
    const signingService = new SigningService(crypto.getRandomValues(new Uint8Array(32)));

    const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(64)));
    const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(64)));
    const initialState = await TokenState.create(
      await MaskedPredicate.create(
        tokenId,
        tokenType,
        signingService,
        HashAlgorithm.SHA256,
        crypto.getRandomValues(new Uint8Array(64)),
      ),
      textEncoder.encode('token state no. 1'),
    );

    const genesis = new Transaction(
      await MintTransactionData.create(
        tokenId,
        tokenType,
        textEncoder.encode('my custom initial data'),
        null,
        (await DirectAddress.create(initialState.unlockPredicate.reference)).toString(),
        crypto.getRandomValues(new Uint8Array(64)),
        await new DataHasher(HashAlgorithm.SHA512).update(initialState.data!).digest(),
        null,
      ),
      new InclusionProof(
        new MerkleTreePath(new DataHash(HashAlgorithm.RIPEMD160, crypto.getRandomValues(new Uint8Array(20))), []),
        null,
        null,
      ),
    );

    const tokenState = await TokenState.create(
      await MaskedPredicate.create(
        tokenId,
        tokenType,
        signingService,
        HashAlgorithm.SHA256,
        crypto.getRandomValues(new Uint8Array(64)),
      ),
      textEncoder.encode('token state no. 2'),
    );

    const transaction = new Transaction(
      await TransactionData.create(
        initialState,
        (await DirectAddress.create(tokenState.unlockPredicate.reference)).toString(),
        crypto.getRandomValues(new Uint8Array(64)),
        await new DataHasher(HashAlgorithm.SHA512).update(tokenState.data!).digest(),
        null,
      ),
      new InclusionProof(
        new MerkleTreePath(new DataHash(HashAlgorithm.RIPEMD160, crypto.getRandomValues(new Uint8Array(20))), []),
        null,
        null,
      ),
    );

    const token = new Token(initialState, genesis, [transaction]);
    const tokens = await Promise.all([
      new TokenJsonSerializer(new PredicateJsonFactory()).deserialize(JSON.parse(JSON.stringify(token))),
      new TokenCborSerializer(new PredicateCborFactory()).deserialize(token.toCBOR()),
    ]);
    for (const token of tokens) {
      expect(token.version).toEqual(TOKEN_VERSION);
      expect(token.id).toEqual(tokenId);
      expect(token.type).toEqual(tokenType);
      expect(token.data).toEqual(textEncoder.encode('my custom initial data'));
      expect(token.coins).toBeFalsy();
      expect(token.nametagTokens.length).toEqual(0);
      expect(token.genesis.inclusionProof).toEqual(genesis.inclusionProof);
      expect(token.transactions.length).toEqual(1);
      expect(token.transactions[0]).toEqual(transaction);
    }
  });
});
