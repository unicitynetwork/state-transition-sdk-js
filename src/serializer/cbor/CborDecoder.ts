import { BitMask } from './BitMask.js';
import { CborError } from './CborError.js';
import { MajorType } from './MajorType.js';
import { HexConverter } from '../../util/HexConverter.js';

export class CborDecoder {
  public static readOptional<T>(data: Uint8Array, reader: (data: Uint8Array) => T): T | null {
    const initialByte = CborDecoder.readByte(data, 0);
    if (initialByte === 0xf6) {
      return null;
    }
    return reader(data);
  }

  public static readUnsignedInteger(data: Uint8Array): bigint {
    const majorType = CborDecoder.readByte(data, 0) & BitMask.MAJOR_TYPE;
    if (majorType != MajorType.UNSIGNED_INTEGER) {
      throw new CborError('Major type mismatch, expected unsigned integer.');
    }

    return CborDecoder.readLength(majorType, data, 0).length;
  }

  public static readNegativeInteger(): bigint {
    throw new CborError('Not implemented.');
  }

  public static readByteString(data: Uint8Array): Uint8Array {
    const majorType = CborDecoder.readByte(data, 0) & BitMask.MAJOR_TYPE;
    if (majorType != MajorType.BYTE_STRING) {
      throw new CborError('Major type mismatch, expected byte string.');
    }

    const { length, position } = CborDecoder.readLength(majorType, data, 0);
    return CborDecoder.read(data, position, Number(length));
  }

  public static readTextString(data: Uint8Array): string {
    const majorType = CborDecoder.readByte(data, 0) & BitMask.MAJOR_TYPE;
    if (majorType != MajorType.TEXT_STRING) {
      throw new CborError('Major type mismatch, expected text string.');
    }
    const { length, position } = CborDecoder.readLength(majorType, data, 0);
    return new TextDecoder().decode(CborDecoder.read(data, position, Number(length)));
  }

  public static readArray(data: Uint8Array): Uint8Array[] {
    const majorType = CborDecoder.readByte(data, 0) & BitMask.MAJOR_TYPE;
    if (majorType != MajorType.ARRAY) {
      throw new CborError('Major type mismatch, expected array.');
    }
    const parsedLength = CborDecoder.readLength(majorType, data, 0);
    let position = parsedLength.position;
    const result: Uint8Array[] = [];
    for (let i = 0; i < parsedLength.length; i++) {
      const rawCbor = CborDecoder.readRawCbor(data, position);
      position = rawCbor.position;
      result.push(rawCbor.data);
    }
    return result;
  }

  public static readMap(data: Uint8Array): Map<string, Uint8Array> {
    const majorType = CborDecoder.readByte(data, 0) & BitMask.MAJOR_TYPE;
    if (majorType != MajorType.MAP) {
      throw new CborError('Major type mismatch, expected map.');
    }
    const parsedLength = CborDecoder.readLength(majorType, data, 0);
    let position = parsedLength.position;
    const result: Map<string, Uint8Array> = new Map();
    for (let i = 0; i < parsedLength.length; i++) {
      const key = CborDecoder.readRawCbor(data, position);
      position = key.position;
      const value = CborDecoder.readRawCbor(data, position);
      position = value.position;
      result.set(HexConverter.encode(key.data), value.data);
    }
    return result;
  }

  public static readTag(data: Uint8Array): { tag: bigint; data: Uint8Array } {
    const majorType = CborDecoder.readByte(data, 0) & BitMask.MAJOR_TYPE;
    if (majorType != MajorType.TAG) {
      throw new CborError('Major type mismatch, expected tag.');
    }
    const { length: tag, position } = CborDecoder.readLength(majorType, data, 0);
    return { data: CborDecoder.readRawCbor(data, position).data, tag };
  }

  public static readBoolean(data: Uint8Array): boolean {
    const byte = CborDecoder.readByte(data, 0);
    if (byte === 0xf5) {
      return true;
    }
    if (byte === 0xf4) {
      return false;
    }
    throw new CborError('Type mismatch, expected boolean.');
  }

  private static readLength(majorType: number, data: Uint8Array, offset: number): { length: bigint; position: number } {
    const additionalInformation = CborDecoder.readByte(data, offset) & BitMask.ADDITIONAL_INFORMATION;
    if (additionalInformation < 24) {
      return {
        length: BigInt(additionalInformation),
        position: offset + 1,
      };
    }

    switch (majorType) {
      case MajorType.ARRAY:
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        if (additionalInformation == 31) {
          throw new CborError('Indefinite length array not supported.');
        }
    }

    if (additionalInformation > 27) {
      throw new CborError('Encoded item is not well-formed.');
    }

    const numberOfLengthBytes = Math.pow(2, additionalInformation - 24);
    let t = BigInt(0);
    for (let i = 0; i < numberOfLengthBytes; ++i) {
      t = (t << 8n) | BigInt(CborDecoder.readByte(data, offset + 1 + i));
    }

    return {
      length: t,
      position: offset + numberOfLengthBytes + 1,
    };
  }

  private static readRawCbor(data: Uint8Array, offset: number): { data: Uint8Array; position: number } {
    const majorType = CborDecoder.readByte(data, offset) & BitMask.MAJOR_TYPE;
    const parsedLength = CborDecoder.readLength(majorType, data, offset);
    const length = parsedLength.length;
    let position = parsedLength.position;

    switch (majorType) {
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        position += Number(length);
        break;
      case MajorType.ARRAY:
        for (let i = 0; i < length; i++) {
          position = CborDecoder.readRawCbor(data, position).position;
        }
        break;
      case MajorType.MAP:
        for (let i = 0; i < length; i++) {
          position = CborDecoder.readRawCbor(data, position).position;
          position = CborDecoder.readRawCbor(data, position).position;
        }
        break;
      case MajorType.TAG:
        position = CborDecoder.readRawCbor(data, position).position;
        break;
    }

    return {
      data: CborDecoder.read(data, offset, position - offset),
      position,
    };
  }

  private static readByte(data: Uint8Array, offset: number): number {
    if (data.length < offset) {
      throw new CborError('Premature end of data.');
    }

    return data[offset] & 0xff;
  }

  private static read(data: Uint8Array, offset: number, length: number): Uint8Array {
    if (data.length < offset + length) {
      throw new CborError('Premature end of data.');
    }

    return data.subarray(offset, offset + length);
  }
}
