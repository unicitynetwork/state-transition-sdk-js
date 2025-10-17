import { Authenticator } from '../../../src/api/Authenticator.js';
import { RequestId } from '../../../src/api/RequestId.js';
import { SubmitCommitmentRequest } from '../../../src/api/SubmitCommitmentRequest.js';
import { DataHash } from '../../../src/hash/DataHash.js';
import { InvalidJsonStructureError } from '../../../src/InvalidJsonStructureError.js';
import { Signature } from '../../../src/sign/Signature.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('SubmitCommitmentRequest', () => {
  it('should encode and decode JSON to exactly same object', async () => {
    // Create test data
    const signingService = new SigningService(
      new Uint8Array(HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001')),
    );

    const stateHash = DataHash.fromImprint(new Uint8Array(34));
    const transactionHash = DataHash.fromImprint(new Uint8Array([0x01, ...new Uint8Array(33)]));
    const requestId = await RequestId.create(signingService.publicKey, stateHash);

    const authenticator = new Authenticator(
      'secp256k1',
      signingService.publicKey,
      Signature.fromJSON(
        'A0B37F8FBA683CC68F6574CD43B39F0343A50008BF6CCEA9D13231D9E7E2E1E411EDC8D307254296264AEBFC3DC76CD8B668373A072FD64665B50000E9FCCE5201',
      ),
      stateHash,
    );

    // Test without receipt
    const request1 = new SubmitCommitmentRequest(requestId, transactionHash, authenticator);

    const json1 = request1.toJSON();
    expect(json1).toEqual({
      authenticator: authenticator.toJSON(),
      receipt: undefined,
      requestId: requestId.toJSON(),
      transactionHash: transactionHash.toJSON(),
    });

    const decoded1 = SubmitCommitmentRequest.fromJSON(json1);
    expect(decoded1).toStrictEqual(request1);
    expect(decoded1.requestId).toStrictEqual(request1.requestId);
    expect(decoded1.transactionHash).toStrictEqual(request1.transactionHash);
    expect(decoded1.authenticator).toStrictEqual(request1.authenticator);
    expect(decoded1.receipt).toStrictEqual(request1.receipt);

    // Test with receipt = true
    const request2 = new SubmitCommitmentRequest(requestId, transactionHash, authenticator, true);

    const json2 = request2.toJSON();
    expect(json2).toEqual({
      authenticator: authenticator.toJSON(),
      receipt: true,
      requestId: requestId.toJSON(),
      transactionHash: transactionHash.toJSON(),
    });

    const decoded2 = SubmitCommitmentRequest.fromJSON(json2);
    expect(decoded2).toStrictEqual(request2);
    expect(decoded2.receipt).toBe(true);

    // Test with receipt = false
    const request3 = new SubmitCommitmentRequest(requestId, transactionHash, authenticator, false);

    const json3 = request3.toJSON();
    expect(json3).toEqual({
      authenticator: authenticator.toJSON(),
      receipt: false,
      requestId: requestId.toJSON(),
      transactionHash: transactionHash.toJSON(),
    });

    const decoded3 = SubmitCommitmentRequest.fromJSON(json3);
    expect(decoded3).toStrictEqual(request3);
    expect(decoded3.receipt).toBe(false);
  });

  it('should validate JSON structure correctly', () => {
    // Valid JSON structure
    const validJson = {
      authenticator: {
        algorithm: 'secp256k1',
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        signature:
          'a0b37f8fba683cc68f6574cd43b39f0343a50008bf6ccea9d13231d9e7e2e1e411edc8d307254296264aebfc3dc76cd8b668373a072fd64665b50000e9fcce5201',
        stateHash: '00000000000000000000000000000000000000000000000000000000000000000000',
      },
      receipt: true,
      requestId: '0000ea659cdc838619b3767c057fdf8e6d99fde2680c5d8517eb06761c0878d40c40',
      transactionHash: '00010000000000000000000000000000000000000000000000000000000000000000',
    };

    expect(SubmitCommitmentRequest.isJSON(validJson)).toBe(true);
    expect(() => SubmitCommitmentRequest.fromJSON(validJson)).not.toThrow();

    // Invalid JSON structures
    expect(SubmitCommitmentRequest.isJSON(null)).toBe(false);
    expect(SubmitCommitmentRequest.isJSON(undefined)).toBe(false);
    expect(SubmitCommitmentRequest.isJSON('string')).toBe(false);
    expect(SubmitCommitmentRequest.isJSON(123)).toBe(false);
    expect(SubmitCommitmentRequest.isJSON({})).toBe(false);
    expect(SubmitCommitmentRequest.isJSON({ authenticator: null })).toBe(false);
    expect(SubmitCommitmentRequest.isJSON({ authenticator: 'string' })).toBe(false);

    // Missing authenticator
    const missingAuthenticator = {
      receipt: true,
      requestId: '0000ea659cdc838619b3767c057fdf8e6d99fde2680c5d8517eb06761c0878d40c40',
      transactionHash: '00010000000000000000000000000000000000000000000000000000000000000000',
    };
    expect(SubmitCommitmentRequest.isJSON(missingAuthenticator)).toBe(false);

    // Test error thrown for invalid JSON
    expect(() => SubmitCommitmentRequest.fromJSON({})).toThrow(InvalidJsonStructureError);
    expect(() => SubmitCommitmentRequest.fromJSON(null)).toThrow(InvalidJsonStructureError);
  });
});
