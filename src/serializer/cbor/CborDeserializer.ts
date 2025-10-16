import { CborError } from './CborError.js';
import { CborMapEntry } from './CborMapEntry.js';
import { CborReader } from './CborReader.js';
import { MajorType } from './MajorType.js';
import { HexConverter } from '../../util/HexConverter.js';

export class CborDeserializer {
  public static readOptional<T>(data: Uint8Array, reader: (data: Uint8Array) => T): T | null {
    const initialByte = new CborReader(data).readByte();
    if (initialByte === 0xf6) {
      return null;
    }
    return reader(data);
  }

  public static readUnsignedInteger(data: Uint8Array): bigint {
    return new CborReader(data).readLength(MajorType.UNSIGNED_INTEGER);
  }

  public static readNegativeInteger(): bigint {
    throw new CborError('Not implemented.');
  }

  public static readByteString(data: Uint8Array): Uint8Array {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.BYTE_STRING);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CborError('Byte string too long.');
    }
    return reader.read(Number(length));
  }

  public static readTextString(data: Uint8Array): string {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.TEXT_STRING);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CborError('Text string too long.');
    }
    return new TextDecoder().decode(reader.read(Number(length)));
  }

  public static readArray(data: Uint8Array): Uint8Array[] {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.ARRAY);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CborError('Array too long.');
    }

    const result: Uint8Array[] = [];
    for (let i = 0; i < length; i++) {
      result.push(reader.readRawCbor());
    }

    return result;
  }

  public static readMap(data: Uint8Array): CborMapEntry[] {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.MAP);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CborError('Map too long.');
    }

    const result: CborMapEntry[] = [];
    const keys = new Set();
    for (let i = 0; i < length; i++) {
      const key = reader.readRawCbor();
      const value = reader.readRawCbor();

      const keyString = HexConverter.encode(key);
      if (keys.has(keyString)) {
        throw new CborError('Duplicate map key found.');
      }
      keys.add(keyString);
      result.push(new CborMapEntry(key, value));
    }

    return result;
  }

  public static readTag(data: Uint8Array): { tag: bigint; data: Uint8Array } {
    const reader = new CborReader(data);
    const tag = reader.readLength(MajorType.TAG);
    return { data: reader.readRawCbor(), tag };
  }

  public static readBoolean(data: Uint8Array): boolean {
    const byte = new CborReader(data).readByte();

    if (byte === 0xf5) {
      return true;
    }
    if (byte === 0xf4) {
      return false;
    }
    throw new CborError('Type mismatch, expected boolean.');
  }
}
