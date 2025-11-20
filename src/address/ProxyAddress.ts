import { AddressFactory } from './AddressFactory.js';
import { AddressScheme } from './AddressScheme.js';
import { IAddress } from './IAddress.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { Token } from '../token/Token.js';
import { TokenId } from '../token/TokenId.js';
import { IMintTransactionReason } from '../transaction/IMintTransactionReason.js';
import { HexConverter } from '../util/HexConverter.js';

const textDecoder = new TextDecoder();

/**
 * Proxy address implementation.
 */
export class ProxyAddress implements IAddress {
  private constructor(
    private readonly data: TokenId,
    private readonly checksum: Uint8Array,
  ) {
    this.checksum = checksum.slice();
  }

  public get scheme(): AddressScheme {
    return AddressScheme.PROXY;
  }

  public get address(): string {
    return this.toString();
  }

  /**
   * Create a proxy address from a nametag string.
   *
   * @param name the nametag
   * @return the proxy address
   */
  public static async fromNameTag(name: string): Promise<ProxyAddress> {
    return ProxyAddress.fromTokenId(await TokenId.fromNameTag(name));
  }

  /**
   * Create a proxy address from a token ID.
   *
   * @param tokenId the token ID
   * @return the proxy address
   */
  public static async fromTokenId(tokenId: TokenId): Promise<ProxyAddress> {
    const checksum = await new DataHasher(HashAlgorithm.SHA256).update(tokenId.bytes).digest();
    return new ProxyAddress(tokenId, checksum.data.slice(0, 4));
  }

  /**
   * Resolve a proxy address to a direct address using a list of nametag tokens. Returns null if could not resolve.
   *
   * @param {IAddress} inputAddress the input address to resolve
   * @param {Token[]} nametagTokens     the list of nametag tokens
   * @return the resolved direct address, or null if resolution fails
   * @throws IllegalArgumentException if the nametagTokens list contains null elements or duplicate
   *                                  addresses
   */
  public static async resolve(inputAddress: IAddress, nametagTokens: Token[]): Promise<IAddress | null> {
    const nametagMap = new Map<string, IAddress>();
    for (const token of nametagTokens) {
      if (token == null) {
        throw new Error('Nametag tokens list cannot contain null elements');
      }

      const address = await ProxyAddress.fromTokenId(token.id).then((proxy) => proxy.address);
      if (nametagMap.has(address)) {
        throw new Error(`Nametag tokens list contains duplicate addresses: ${address}`);
      }

      if (token.data == null) {
        throw new Error('Nametag token data cannot be null');
      }

      nametagMap.set(address, await AddressFactory.createAddress(textDecoder.decode(token.data)));
    }

    let targetAddress: IAddress | null = inputAddress;
    while (targetAddress !== null && targetAddress.scheme != AddressScheme.DIRECT) {
      targetAddress = nametagMap.get(targetAddress.address) ?? null;
    }

    return targetAddress;
  }

  public toString(): string {
    return `${AddressScheme.PROXY}://${HexConverter.encode(this.data.bytes)}${HexConverter.encode(this.checksum)}`;
  }
}
