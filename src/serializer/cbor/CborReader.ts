import { CborError } from './CborError.js';
import { MajorType } from './MajorType.js';

export class CborReader {
  private static MAJOR_TYPE_MASK = 0b11100000;
  private static ADDITIONAL_INFORMATION_MASK = 0b00011111;

  private position: number = 0;

  public constructor(private readonly data: Uint8Array) {
  }

  public readByte(): number {
    if (this.position >= this.data.length) {
      throw new CborError('Premature end of data.');
    }

    return this.data[this.position++];
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

  public readLength(majorType: MajorType): bigint {
    const initialByte = this.readByte();

    if ((initialByte & CborReader.MAJOR_TYPE_MASK) !== majorType) {
      throw new CborError('Major type mismatch.');
    }

    const additionalInformation = initialByte & CborReader.ADDITIONAL_INFORMATION_MASK;
    if (additionalInformation < 24) {
      return BigInt(additionalInformation);
    }

    switch (majorType) {
      case MajorType.ARRAY:
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        if (additionalInformation == 31) {
          throw new CborError('Indefinite length array not supported.');
        }
        break;
      default:
    }

    if (additionalInformation > 27) {
      throw new CborError('Encoded item is not well-formed.');
    }

    let t = 0n;
    const length = Math.pow(2, additionalInformation - 24);
    for (let i = 0; i < length; ++i) {
      t = (t << 8n) | BigInt(this.readByte());
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
    switch (majorType) {
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