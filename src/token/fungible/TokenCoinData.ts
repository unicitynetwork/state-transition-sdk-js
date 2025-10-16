import { CoinId } from './CoinId.js';
import { ISerializable } from '../../ISerializable.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/** JSON representation for coin balances. */
export type TokenCoinDataJson = [string, string][];

/**
 * Container for fungible coin balances attached to a token.
 */
export class TokenCoinData implements ISerializable {
  /**
   * @param _coins Map of coin id bytes hex and their balances.
   */
  private constructor(private readonly _coins: Map<string, bigint>) {}

  public get coins(): [CoinId, bigint][] {
    return Array.from(this._coins.entries()).map(([key, value]) => [CoinId.fromJSON(key), value]);
  }

  public get length(): number {
    return this._coins.size;
  }

  /**
   * Create a new coin data object from an array of coin id and balance pairs.
   * @param data Array of tuples of CoinId and bigint.
   */
  public static create(data: [CoinId, bigint][]): TokenCoinData {
    const coins = new Map<string, bigint>();
    for (const [coinId, balance] of data) {
      coins.set(coinId.toJSON(), balance);
    }
    return new TokenCoinData(coins);
  }

  /** Create a coin data object from CBOR. */
  public static fromCBOR(data: Uint8Array): TokenCoinData {
    const coins = new Map<string, bigint>();
    const entries = CborDeserializer.readArray(data);
    for (const item of entries) {
      const [key, value] = CborDeserializer.readArray(item);
      coins.set(
        HexConverter.encode(CborDeserializer.readByteString(key)),
        BigintConverter.decode(CborDeserializer.readByteString(value)),
      );
    }

    return new TokenCoinData(coins);
  }

  /** Parse from a JSON representation. */
  public static fromJSON(data: unknown): TokenCoinData {
    if (
      !Array.isArray(data) ||
      !data.every(
        (value) =>
          Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string',
      )
    ) {
      throw new Error('Invalid coin data JSON format');
    }

    return new TokenCoinData(new Map(data.map(([key, value]) => [key, BigInt(value)])));
  }

  public get(id: CoinId): bigint | null {
    return this._coins.get(id.toJSON()) ?? null;
  }

  /** @inheritDoc */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      ...Array.from(this._coins.entries()).map(([key, value]) =>
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(HexConverter.decode(key)),
          CborSerializer.encodeByteString(BigintConverter.encode(value)),
        ),
      ),
    );
  }

  /** @inheritDoc */
  public toJSON(): TokenCoinDataJson {
    return Array.from(this._coins.entries()).map(([key, value]) => [key.toString(), value.toString()]);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      TokenCoinData:
        ${Array.from(this._coins.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}`;
  }
}
