import { IUserDefinedMintReasonData } from './IUserDefinedMintReasonData.js';
import { IUserDefinedMintReasonFactory } from './IUserDefinedMintReasonFactory.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';

export class DefaultUserDefinedMintReasonFactory implements IUserDefinedMintReasonFactory {
  public constructor(
    private readonly reasons: Map<bigint, { fromBytes: (bytes: Uint8Array) => IUserDefinedMintReasonData }> = new Map(),
  ) {}

  public create(bytes: Uint8Array): Promise<IUserDefinedMintReasonData> {
    const data = CborDeserializer.readArray(bytes);

    const type = CborDeserializer.readUnsignedInteger(data[0]);
    const factory = this.reasons.get(type);
    if (!factory) {
      throw new Error('Unsupported user defined mint reason type.');
    }

    return Promise.resolve(factory.fromBytes(bytes));
  }
}
