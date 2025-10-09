import { CborError } from './CborError.js';
import { MajorType } from './MajorType.js';
import { HexConverter } from '../../util/HexConverter.js';

export class CborEncoder {
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

    const bytes = CborEncoder.getUnsignedIntegerAsPaddedBytes(input);

    return new Uint8Array([
      MajorType.UNSIGNED_INTEGER | CborEncoder.getAdditionalInformationBits(bytes.length),
      ...bytes,
    ]);
  }

  public static encodeByteString(input: Uint8Array): Uint8Array {
    if (input.length < 24) {
      return new Uint8Array([MajorType.BYTE_STRING | input.length, ...input]);
    }

    const lengthBytes = CborEncoder.getUnsignedIntegerAsPaddedBytes(input.length);
    return new Uint8Array([
      MajorType.BYTE_STRING | CborEncoder.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...input,
    ]);
  }

  public static encodeTextString(input: string): Uint8Array {
    const bytes = new TextEncoder().encode(input);
    if (bytes.length < 24) {
      return new Uint8Array([MajorType.TEXT_STRING | bytes.length, ...bytes]);
    }

    const lengthBytes = CborEncoder.getUnsignedIntegerAsPaddedBytes(bytes.length);
    return new Uint8Array([
      MajorType.TEXT_STRING | CborEncoder.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...bytes,
    ]);
  }

  public static encodeArray(input: Uint8Array[]): Uint8Array {
    const data = new Uint8Array(input.reduce((result, value) => result + value.length, 0));
    let length = 0;
    for (const value of input) {
      data.set(value, length);
      length += value.length;
    }

    if (input.length < 24) {
      return new Uint8Array([MajorType.ARRAY | input.length, ...data]);
    }

    const lengthBytes = CborEncoder.getUnsignedIntegerAsPaddedBytes(input.length);
    return new Uint8Array([
      MajorType.ARRAY | CborEncoder.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...data,
    ]);
  }

  public static encodeMap(input: Map<string, Uint8Array>): Uint8Array {
    const processedArray = Array.from(input.entries()).map(([key, value]) => [HexConverter.decode(key), value]);
    processedArray.sort(([a], [b]) => {
      if (a.length !== b.length) {
        return a.length - b.length;
      }

      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return a[i] - b[i];
        }
      }

      return 0;
    });

    const dataLength = processedArray.reduce((result, [key, value]) => result + key.length + value.length, 0);
    const data = new Uint8Array(dataLength);
    let length = 0;
    for (const [key, value] of processedArray) {
      data.set(key, length);
      length += key.length;
      data.set(value, length);
      length += value.length;
    }

    if (input.size < 24) {
      return new Uint8Array([MajorType.MAP | input.size, ...data]);
    }

    const lengthBytes = CborEncoder.getUnsignedIntegerAsPaddedBytes(input.size);
    return new Uint8Array([
      MajorType.MAP | CborEncoder.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...data,
    ]);
  }

  public static encodeTag(tag: number | bigint, input: Uint8Array): Uint8Array {
    if (tag < 24) {
      return new Uint8Array([MajorType.TAG | Number(tag), ...input]);
    }
    const bytes = CborEncoder.getUnsignedIntegerAsPaddedBytes(tag);

    return new Uint8Array([MajorType.TAG | CborEncoder.getAdditionalInformationBits(bytes.length), ...bytes, ...input]);
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
