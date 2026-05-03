import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { SparseMerkleTreePath } from '../../../../src/smt/plain/SparseMerkleTreePath.js';
import { SparseMerkleTreePathStep } from '../../../../src/smt/plain/SparseMerkleTreePathStep.js';
import { BigintConverter } from '../../../../src/util/BigintConverter.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

describe('SparseMerkleTreePath', () => {
  it('should encode and decode to exactly same object', () => {
    const path = new SparseMerkleTreePath(DataHash.fromImprint(new Uint8Array(34)), [
      new SparseMerkleTreePathStep(0n, new Uint8Array([1, 2, 3])),
    ]);

    expect(HexConverter.encode(path.toCBOR())).toStrictEqual(
      '8258220000000000000000000000000000000000000000000000000000000000000000000081824043010203',
    );
    expect(SparseMerkleTreePath.fromCBOR(path.toCBOR())).toStrictEqual(path);
  });

  it('should verify inclusion path', async () => {
    const path = SparseMerkleTreePath.fromCBOR(
      CborSerializer.encodeArray(
        CborSerializer.encodeByteString(
          HexConverter.decode('0000e9748bbd0c45fc357ffe7c221c7db1ef02f589680d8b0a370b48a669435bde13'),
        ),
        CborSerializer.encodeArray(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(69n)),
            CborSerializer.encodeByteString(HexConverter.decode('76616c756535')),
          ),
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(4n)),
            CborSerializer.encodeByteString(
              HexConverter.decode('8471f8ea3c9a0e50627df4c72d9bd5affbdc12050ee7f4250974ed64949f3b0f'),
            ),
          ),
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(1n)),
            CborSerializer.encodeByteString(
              HexConverter.decode('66507538ce0fae31018cfc7b01841b5308e7e44306445710acee947ec4a4b2cd'),
            ),
          ),
        ),
      ),
    );

    expect(await path.verify(0b100010100n)).toEqual({ isPathIncluded: true, isPathValid: true, isSuccessful: true });
  });

  it('should verify non inclusion path', async () => {
    const path = SparseMerkleTreePath.fromCBOR(
      CborSerializer.encodeArray(
        CborSerializer.encodeByteString(
          HexConverter.decode('0000e9748bbd0c45fc357ffe7c221c7db1ef02f589680d8b0a370b48a669435bde13'),
        ),
        CborSerializer.encodeArray(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(69n)),
            CborSerializer.encodeByteString(HexConverter.decode('76616c756535')),
          ),
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(4n)),
            CborSerializer.encodeByteString(
              HexConverter.decode('8471f8ea3c9a0e50627df4c72d9bd5affbdc12050ee7f4250974ed64949f3b0f'),
            ),
          ),
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(1n)),
            CborSerializer.encodeByteString(
              HexConverter.decode('66507538ce0fae31018cfc7b01841b5308e7e44306445710acee947ec4a4b2cd'),
            ),
          ),
        ),
      ),
    );

    expect(await path.verify(0b1000000n)).toEqual({ isPathIncluded: false, isPathValid: true, isSuccessful: false });
  });

  it('should verify empty tree path', async () => {
    const path = SparseMerkleTreePath.fromCBOR(
      CborSerializer.encodeArray(
        CborSerializer.encodeByteString(
          HexConverter.decode('00001e54402898172f2948615fb17627733abbd120a85381c624ad060d28321be672'),
        ),
        CborSerializer.encodeArray(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(1n)),
            CborSerializer.encodeNull(),
          ),
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(1n)),
            CborSerializer.encodeNull(),
          ),
        ),
      ),
    );

    expect(await path.verify(101n)).toEqual({ isPathIncluded: false, isPathValid: true, isSuccessful: false });
  });
});
