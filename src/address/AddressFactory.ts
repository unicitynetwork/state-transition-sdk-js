import { AddressScheme } from './AddressScheme.js';
import { DirectAddress } from './DirectAddress.js';
import { IAddress } from './IAddress.js';
import { ProxyAddress } from './ProxyAddress.js';
import { DataHash } from '../hash/DataHash.js';
import { TokenId } from '../token/TokenId.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Factory for creating Address instances from string representations.
 */
export class AddressFactory {
  /**
   * Create an Address from its string representation.
   *
   * @param {string} address The address string.
   * @return The corresponding Address instance.
   */
  public static async createAddress(address: string): Promise<IAddress> {
    const result = address.split('://', 2);
    if (result.length != 2) {
      throw new Error('Invalid address format');
    }

    let expectedAddress: IAddress;
    const bytes = HexConverter.decode(result[1]);

    switch (result.at(0)) {
      case AddressScheme.DIRECT:
        expectedAddress = await DirectAddress.create(DataHash.fromImprint(bytes.slice(0, -4)));
        break;
      case AddressScheme.PROXY:
        expectedAddress = await ProxyAddress.fromTokenId(new TokenId(bytes.slice(0, -4)));
        break;
      default:
        throw new Error(`Invalid address format: ${result.at(0)}`);
    }

    if (expectedAddress.address !== address) {
      throw new Error('Address checksum mismatch');
    }

    return expectedAddress;
  }
}
