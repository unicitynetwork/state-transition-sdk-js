import { StateId } from '../../../src/api/StateId.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { Address } from '../../../src/transaction/Address.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';

describe('StateId', () => {
  it('should encode and decode to exactly same object', async () => {
    const stateId = await StateId.fromTransaction(
      await MintTransaction.create(
        Address.fromBytes(new Uint8Array(32)),
        new TokenId(new Uint8Array(32)),
        new TokenType(new Uint8Array(32)),
        new Uint8Array(0),
      ),
    );

    expect(HexConverter.encode(stateId.toCBOR())).toStrictEqual(
      '5820b08cbe261c1441a4f9c5127accaa683c5da8c87290bb28cddbddfac0b5033958',
    );
    expect(StateId.fromCBOR(stateId.toCBOR())).toStrictEqual(stateId);
  });
});
