import { CborDeserializer } from '../src/serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../src/serializer/cbor/CborSerializer.js';
import { IMintTransactionReason } from '../src/transaction/IMintTransactionReason.js';
import { VerificationResult } from '../src/verification/VerificationResult.js';
import { VerificationResultCode } from '../src/verification/VerificationResultCode.js';

export class TestEmptyMintReason implements IMintTransactionReason {
  public static readonly TYPE = BigInt(0);

  public constructor() {}

  public static fromCBOR(bytes: Uint8Array): Promise<TestEmptyMintReason> {
    const data = CborDeserializer.readArray(bytes);

    const type = CborDeserializer.readUnsignedInteger(data[0]);
    if (type !== TestEmptyMintReason.TYPE) {
      throw new Error('Invalid test reason type.');
    }

    return Promise.resolve(new TestEmptyMintReason());
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(CborSerializer.encodeUnsignedInteger(TestEmptyMintReason.TYPE));
  }

  public verify(): Promise<VerificationResult> {
    return Promise.resolve(new VerificationResult(VerificationResultCode.OK));
  }
}
