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
      '58202d3f8a3769426d10ccafa08f332955faf34ba22873ae096d0ee2b19303b2d171',
    );
    expect(StateId.fromCBOR(stateId.toCBOR())).toStrictEqual(stateId);
  });
});
