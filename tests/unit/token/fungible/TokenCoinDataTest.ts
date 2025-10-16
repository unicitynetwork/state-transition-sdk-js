import { TokenCoinData } from '../../../../src/token/fungible/TokenCoinData.js';
import { InvalidJsonStructureError } from '../../../../src/InvalidJsonStructureError';

describe('TokenCoinData', () => {
  it('should check if json input is correct', () => {
    expect(() => TokenCoinData.fromJSON([[123n, 456n]])).toThrow(InvalidJsonStructureError);
    expect(TokenCoinData.fromJSON([['0123', '456']])).toEqual({ _coins: new Map([['0123', 456n]]) });
    expect(TokenCoinData.fromJSON([['0123', '456']]).toJSON()).toEqual([['0123', '456']]);
  });
});
