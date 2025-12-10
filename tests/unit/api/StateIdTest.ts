import { StateId } from '../../../src/api/StateId.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';

describe('StateId', () => {
  it('should encode and decode to exactly same object', () => {
    const stateId = StateId.fromJSON('0000c2db43b488c83f1000ef6e6fb9d12fba5e1423cefd1909d5eb2018d3855a9323');

    expect(HexConverter.encode(stateId.toCBOR())).toStrictEqual(
      '58220000c2db43b488c83f1000ef6e6fb9d12fba5e1423cefd1909d5eb2018d3855a9323',
    );
    expect(StateId.fromCBOR(stateId.toCBOR())).toStrictEqual(stateId);
    expect(stateId.toJSON()).toStrictEqual('0000c2db43b488c83f1000ef6e6fb9d12fba5e1423cefd1909d5eb2018d3855a9323');
    expect(StateId.fromJSON(stateId.toJSON())).toStrictEqual(stateId);
  });
});
