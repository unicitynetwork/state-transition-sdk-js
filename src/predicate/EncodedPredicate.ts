import { IPredicate } from './IPredicate.js';

export class EncodedPredicate implements IPredicate {
  protected constructor(
    public readonly type: bigint,
    private readonly _bytes: Uint8Array,
  ) {
    this._bytes = new Uint8Array(_bytes);
  }

  public static create(predicate: IPredicate): EncodedPredicate {
    return new EncodedPredicate(predicate.type, predicate.encode());
  }

  // TODO: Make encode to handle raw bytes currently to work with existing aggregator

  // public static decode(bytes: Uint8Array): EncodedPredicate {
  //   const data = CborDeserializer.decodeArray(bytes);
  //
  //   return new EncodedPredicate(
  //     CborDeserializer.decodeUnsignedInteger(data[0]),
  //     CborDeserializer.decodeByteString(data[1]),
  //   );
  // }
  //
  // public encode(): Uint8Array {
  //   return CborSerializer.encodeArray(
  //     CborSerializer.encodeUnsignedInteger(this.type),
  //     CborSerializer.encodeByteString(this._bytes),
  //   );
  // }

  public static decode(bytes: Uint8Array): EncodedPredicate {
    return new EncodedPredicate(1n, bytes);
  }

  public encode(): Uint8Array {
    return new Uint8Array(this._bytes);
  }
}
