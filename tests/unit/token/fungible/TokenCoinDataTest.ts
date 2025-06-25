import { TokenCoinData } from '../../../../src/token/fungible/TokenCoinData.js';

describe('TokenCoinData', () => {
  it('should check if json input is correct', () => {
    expect(() => TokenCoinData.fromJSON([[123n, 456n]])).toThrow('Invalid coin data JSON format');
    expect(TokenCoinData.fromJSON([['123', '456']])).toEqual({ _coins: new Map([[123n, 456n]]) });
    expect(TokenCoinData.fromJSON([['123', '456']]).toJSON()).toEqual([['123', '456']]);
  });
});
