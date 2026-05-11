import { CborError } from './CborError.js';
import { MajorType } from './MajorType.js';

export class CborReader {
  private static ADDITIONAL_INFORMATION_MASK = 0b00011111;
  private static MAJOR_TYPE_MASK = 0b11100000;

  private position: number = 0;

  public constructor(private readonly data: Uint8Array) {}

  public assertExhausted(): void {
    if (this.position !== this.data.length) {
      throw new CborError(
        `Expected end of data: ${this.data.length - this.position} byte(s) remaining at position ${this.position}.`,
      );
    }
  }

  public read(length: number): Uint8Array {
    try {
      if (this.position + length > this.data.length) {
        throw new CborError('Premature end of data.');
      }

      return this.data.slice(this.position, this.position + length);
    } finally {
      this.position += length;
    }
  }

  public readByte(): number {
    if (this.position >= this.data.length) {
      throw new CborError('Premature end of data.');
    }

    return this.data[this.position++];
  }

  public readLength(majorType: MajorType): bigint {
    const initialByte = this.readByte();
    const parsedMajorType = (initialByte & CborReader.MAJOR_TYPE_MASK) as MajorType;

    if (parsedMajorType !== majorType) {
      throw new CborError(`Major type mismatch: expected ${majorType}, got ${parsedMajorType}.`);
    }

    const additionalInformation = initialByte & CborReader.ADDITIONAL_INFORMATION_MASK;
    if (additionalInformation < 24) {
      return BigInt(additionalInformation);
    }

    switch (majorType) {
      case MajorType.MAP:
      case MajorType.ARRAY:
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        if (additionalInformation == 31) {
          throw new CborError(`Indefinite-length encoding not allowed in canonical CBOR (major type ${majorType}).`);
        }
        break;
    }

    if (additionalInformation > 27) {
      throw new CborError(`Reserved additional information ${additionalInformation} for major type ${majorType}.`);
    }

    let t = 0n;
    const length = Math.pow(2, additionalInformation - 24);
    for (let i = 0; i < length; ++i) {
      t = (t << 8n) | BigInt(this.readByte());
    }

    const threshold = length === 1 ? 24n : 1n << BigInt(length * 4);
    if (t < threshold) {
      throw new CborError(`Byte length ${length} is not canonical for value ${t}.`);
    }

    return t;
  }

  public readRawCbor(): Uint8Array {
    if (this.position >= this.data.length) {
      throw new CborError('Premature end of data.');
    }

    const majorType = this.data[this.position] & CborReader.MAJOR_TYPE_MASK;
    const position = this.position;
    const length = this.readLength(majorType);
    switch (majorType as MajorType) {
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        this.read(Number(length));
        break;
      case MajorType.ARRAY:
        for (let i = 0; i < length; i++) {
          this.readRawCbor();
        }
        break;
      case MajorType.MAP:
        for (let i = 0; i < length; i++) {
          this.readRawCbor();
          this.readRawCbor();
        }
        break;
      case MajorType.TAG:
        this.readRawCbor();
        break;
      default:
        break;
    }

    return this.data.slice(position, this.position);
  }
}
