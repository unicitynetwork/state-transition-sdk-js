import { StateId } from '../../../src/api/StateId.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../../src/transaction/PayToScriptHash.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';

describe('StateId', () => {
  it('should encode and decode to exactly same object', async () => {
    const stateId = await StateId.fromTransaction(
      await MintTransaction.create(
        PayToScriptHash.fromBytes(new Uint8Array(32)),
        new TokenId(new Uint8Array(32)),
        new TokenType(new Uint8Array(32)),
        new Uint8Array(0),
      ),
    );

    expect(HexConverter.encode(stateId.toCBOR())).toStrictEqual(
      '58205b4e69562ce02e38923a4c48727fabb8f0b2f4489e5d02c014a618ad83382891',
    );
    expect(StateId.fromCBOR(stateId.toCBOR())).toStrictEqual(stateId);
  });
});
