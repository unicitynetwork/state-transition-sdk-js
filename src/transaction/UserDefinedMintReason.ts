import { IMintTransactionReason } from './IMintTransactionReason.js';
import { IUserDefinedMintReasonData } from './IUserDefinedMintReasonData.js';
import { IUserDefinedMintReasonFactory } from './IUserDefinedMintReasonFactory.js';
import { MintReasonType } from './MintReasonType.js';
import { MintTransaction } from './MintTransaction.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { VerificationResult } from '../verification/VerificationResult.js';

export class UserDefinedMintReason implements IMintTransactionReason {
  public constructor(private readonly _reason: IUserDefinedMintReasonData) {}

  /**
   * Create user defined reason from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @param factory factory to create user defined reason data
   * @return user defined reason proof
   */
  public static async fromCBOR(
    bytes: Uint8Array,
    factory: IUserDefinedMintReasonFactory,
  ): Promise<UserDefinedMintReason> {
    const data = CborDeserializer.readArray(bytes);

    const type = CborDeserializer.readUnsignedInteger(data[0]);
    if (type !== BigInt(MintReasonType.USER_DEFINED)) {
      throw new Error('Invalid mint reason type for SplitMintReason.');
    }

    return new UserDefinedMintReason(await factory.create(CborDeserializer.readByteString(data[1])));
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(MintReasonType.USER_DEFINED),
      CborSerializer.encodeByteString(this._reason.toBytes()),
    );
  }

  public verify(transaction: MintTransaction): Promise<VerificationResult> {
    return this._reason.verify(transaction);
  }
}
