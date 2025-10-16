import { CborError } from './CborError.js';
import { CborMap } from './CborMap.js';
import { MajorType } from './MajorType.js';
import { HexConverter } from '../../util/HexConverter.js';

export class CborSerializer {
  public static encodeOptional<T>(data: T | null | undefined, encoder: (data: T) => Uint8Array): Uint8Array {
    if (data == null) {
      return new Uint8Array([0xf6]);
    }

    return encoder(data);
  }

  public static encodeUnsignedInteger(input: bigint | number): Uint8Array {
    if (input < 0) {
      throw new CborError('Only unsigned numbers are allowed.');
    }

    if (input < 24) {
      return new Uint8Array([MajorType.UNSIGNED_INTEGER | Number(input)]);
    }

    const bytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(input);

    return new Uint8Array([
      MajorType.UNSIGNED_INTEGER | CborSerializer.getAdditionalInformationBits(bytes.length),
      ...bytes,
    ]);
  }

  public static encodeByteString(input: Uint8Array): Uint8Array {
    if (input.length < 24) {
      return new Uint8Array([MajorType.BYTE_STRING | input.length, ...input]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(input.length);
    return new Uint8Array([
      MajorType.BYTE_STRING | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...input,
    ]);
  }

  public static encodeTextString(input: string): Uint8Array {
    const bytes = new TextEncoder().encode(input);
    if (bytes.length < 24) {
      return new Uint8Array([MajorType.TEXT_STRING | bytes.length, ...bytes]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(bytes.length);
    return new Uint8Array([
      MajorType.TEXT_STRING | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...bytes,
    ]);
  }

  public static encodeArray(...input: Uint8Array[]): Uint8Array {
    const data = new Uint8Array(input.reduce((result, value) => result + value.length, 0));
    let length = 0;
    for (const value of input) {
      data.set(value, length);
      length += value.length;
    }

    if (input.length < 24) {
      return new Uint8Array([MajorType.ARRAY | input.length, ...data]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(input.length);
    return new Uint8Array([
      MajorType.ARRAY | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...data,
    ]);
  }

  public static encodeMap(input: CborMap): Uint8Array {
    const entries = input.entries;
    const dataLength = entries.reduce((result, entry) => result + entry.key.length + entry.value.length, 0);
    const data = new Uint8Array(dataLength);
    let length = 0;
    for (const entry of entries) {
      data.set(entry.key, length);
      length += entry.key.length;
      data.set(entry.value, length);
      length += entry.value.length;
    }

    if (entries.length < 24) {
      return new Uint8Array([MajorType.MAP | entries.length, ...data]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(entries.length);
    return new Uint8Array([
      MajorType.MAP | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...data,
    ]);
  }

  public static encodeTag(tag: number | bigint, input: Uint8Array): Uint8Array {
    if (tag < 24) {
      return new Uint8Array([MajorType.TAG | Number(tag), ...input]);
    }
    const bytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(tag);

    return new Uint8Array([
      MajorType.TAG | CborSerializer.getAdditionalInformationBits(bytes.length),
      ...bytes,
      ...input,
    ]);
  }

  public static encodeBoolean(data: boolean): Uint8Array {
    if (data) {
      return new Uint8Array([0xf5]);
    }
    return new Uint8Array([0xf4]);
  }

  public static encodeNull(): Uint8Array {
    return new Uint8Array([0xf6]);
  }

  private static getAdditionalInformationBits(length: number): number {
    return 24 + Math.ceil(Math.log2(length));
  }

  private static getUnsignedIntegerAsPaddedBytes(input: bigint | number): Uint8Array {
    if (input < 0) {
      throw new CborError('Only unsigned numbers are allowed.');
    }

    let t: bigint;
    const bytes: number[] = [];

    for (t = BigInt(input); t > 0; t = t >> 8n) {
      bytes.push(Number(t & 255n));
    }

    if (bytes.length > 8) {
      throw new CborError('Number is not unsigned long.');
    }

    if (bytes.length === 0) {
      bytes.push(0);
    }

    bytes.reverse();

    const data = new Uint8Array(Math.pow(2, Math.ceil(Math.log2(bytes.length))));
    data.set(bytes, data.length - bytes.length);

    return data;
  }
}
