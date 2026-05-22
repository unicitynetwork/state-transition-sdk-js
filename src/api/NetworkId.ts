/**
 * Unicity network identifier (α). Used to scope token ids and other
 * network-bound values so they cannot be replayed across networks.
 *
 * `0` is reserved as an uninitialized sentinel and is rejected by
 * {@link NetworkId.fromId}.
 */
export class NetworkId {
  public static readonly LOCAL = new NetworkId(3, 'LOCAL');
  public static readonly MAINNET = new NetworkId(1, 'MAINNET');
  public static readonly TESTNET = new NetworkId(2, 'TESTNET');

  private constructor(
    public readonly id: number,
    public readonly name: string,
  ) {}

  /**
   * Look up a NetworkId by its numeric identifier.
   *
   * @param {number|bigint} id Numeric network identifier.
   * @returns {NetworkId} Matching network identifier.
   * @throws {Error} If `id` is `0`, negative, or not registered.
   */
  public static fromId(id: number | bigint): NetworkId {
    const value = BigInt(id);
    if (value < 0n || value > 0xffffffffn) {
      throw new Error(`Network identifier out of 32-bit unsigned range: ${id}.`);
    }
    switch (Number(value)) {
      case NetworkId.MAINNET.id:
        return NetworkId.MAINNET;
      case NetworkId.TESTNET.id:
        return NetworkId.TESTNET;
      case NetworkId.LOCAL.id:
        return NetworkId.LOCAL;
      default:
        throw new Error(`Unknown network identifier: ${id}.`);
    }
  }

  /**
   * @returns {string} Human-readable name of the network.
   */
  public toString(): string {
    return this.name;
  }
}
