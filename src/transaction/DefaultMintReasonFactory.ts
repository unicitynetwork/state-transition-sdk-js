import { IMintReasonFactory } from './IMintReasonFactory.js';
import { IMintTransactionReason } from './IMintTransactionReason.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { SplitMintReason } from '../token/fungible/SplitMintReason.js';

export class DefaultMintReasonFactory implements IMintReasonFactory {
  public constructor(
    private readonly reasons: Map<
      bigint,
      { fromCBOR: (bytes: Uint8Array) => Promise<IMintTransactionReason> }
    > = new Map([[SplitMintReason.TYPE, SplitMintReason]]),
  ) {}

  public create(bytes: Uint8Array): Promise<IMintTransactionReason> {
    const data = CborDeserializer.readArray(bytes);

    const type = CborDeserializer.readUnsignedInteger(data[0]);
    const factory = this.reasons.get(type);
    if (!factory) {
      throw new Error('Unsupported user defined mint reason type.');
    }

    return Promise.resolve(factory.fromCBOR(bytes));
  }
}
