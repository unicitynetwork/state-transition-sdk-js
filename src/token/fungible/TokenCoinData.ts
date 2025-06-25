import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { CoinId } from './CoinId.js';
import { ISerializable } from '../../ISerializable.js';

/** JSON representation for coin balances. */
export type TokenCoinDataJson = [string, string][];

/**
 * Container for fungible coin balances attached to a token.
 */
export class TokenCoinData implements ISerializable {
  private readonly _coins: Map<bigint, bigint>;

  /**
   * @param coins Array of coin id serialized to bigint and balance pairs
   */
  public constructor(coins: [bigint, bigint][]) {
    this._coins = new Map(coins);
  }

  /** Get total number of different coins */
  public get size(): number {
    return this._coins.size;
  }

  public get coins(): Map<CoinId, bigint> {
    return new Map(Array.from(this._coins.entries()).map(([key, value]) => [CoinId.fromBigInt(key), value]));
  }

  /**
   * Create a new coin data object from an array of coin id and balance pairs.
   * @param coins Array of tuples of CoinId and bigint.
   */
  public static create(coins: [CoinId, bigint][]): TokenCoinData {
    return new TokenCoinData(coins.map(([key, value]) => [key.toBigInt(), value]));
  }

  /** Create a coin data object from CBOR. */
  public static fromCBOR(data: Uint8Array): TokenCoinData {
    const coins: [bigint, bigint][] = [];
    const entries = CborDecoder.readArray(data);
    for (const item of entries) {
      const [key, value] = CborDecoder.readArray(item);
      coins.push([
        BigintConverter.decode(CborDecoder.readByteString(key)),
        BigintConverter.decode(CborDecoder.readByteString(value)),
      ]);
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

    const coins: [bigint, bigint][] = [];

    for (const [key, value] of data) {
      coins.push([BigInt(key), BigInt(value)]);
    }

    return new TokenCoinData(coins);
  }

  /** Get the balance of a specific coin. */
  public get(coinId: CoinId): bigint | undefined {
    return this._coins.get(coinId.toBigInt());
  }

  /** Get the balance of a coin by its internal map key. */
  public getByKey(coinId: bigint): bigint | undefined {
    return this._coins.get(coinId);
  }

  /** @inheritDoc */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray(
      Array.from(this._coins.entries()).map(([key, value]) =>
        CborEncoder.encodeArray([
          CborEncoder.encodeByteString(BigintConverter.encode(key)),
          CborEncoder.encodeByteString(BigintConverter.encode(value)),
        ]),
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
      FungibleTokenData
        ${Array.from(this._coins.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}`;
  }
}
