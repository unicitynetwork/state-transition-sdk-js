import { RequestId } from '../../../src/api/RequestId.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('RequestId', () => {
  it('should encode and decode to exactly same object', async () => {
    const requestId = await RequestId.create(new Uint8Array(20), DataHash.fromImprint(new Uint8Array(34)));

    expect(HexConverter.encode(requestId.toCBOR())).toStrictEqual(
      '58220000ea659cdc838619b3767c057fdf8e6d99fde2680c5d8517eb06761c0878d40c40',
    );
    expect(RequestId.fromCBOR(requestId.toCBOR())).toStrictEqual(requestId);
    expect(requestId.toJSON()).toStrictEqual('0000ea659cdc838619b3767c057fdf8e6d99fde2680c5d8517eb06761c0878d40c40');
    expect(RequestId.fromJSON(requestId.toJSON())).toStrictEqual(requestId);
  });
});
