import { DefaultUserDefinedMintReasonFactory } from './DefaultUserDefinedMintReasonFactory.js';
import { IMintTransactionReason } from './IMintTransactionReason.js';
import { IUserDefinedMintReasonFactory } from './IUserDefinedMintReasonFactory.js';
import { MintReasonType } from './MintReasonType.js';
import { UserDefinedMintReason } from './UserDefinedMintReason.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { SplitMintReason } from '../token/fungible/SplitMintReason.js';

export class MintTransactionReasonFactory {
  public constructor(public readonly factory: IUserDefinedMintReasonFactory) {}

  public static standard(): MintTransactionReasonFactory {
    return new MintTransactionReasonFactory(new DefaultUserDefinedMintReasonFactory());
  }

  public create(bytes: Uint8Array): Promise<IMintTransactionReason> {
    const data = CborDeserializer.readArray(bytes);

    const type = CborDeserializer.readUnsignedInteger(data[0]);
    switch (type) {
      case BigInt(MintReasonType.TOKEN_SPLIT):
        return SplitMintReason.fromCBOR(bytes);
      case BigInt(MintReasonType.USER_DEFINED):
        return UserDefinedMintReason.fromCBOR(bytes, this.factory);
      default:
        throw new Error('Unsupported mint transaction reason type.');
    }
  }
}
