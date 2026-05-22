/**
 * Unicity network identifier (α). Used to scope token ids and other
 * network-bound values so they cannot be replayed across networks.
 *
 * `0` is reserved as an uninitialized sentinel and is rejected by
 * {@link NetworkId.fromId}.
 */
export class NetworkId {
  public static readonly LOCAL = new NetworkId(3n, 'LOCAL');
  public static readonly MAINNET = new NetworkId(1n, 'MAINNET');
  public static readonly TESTNET = new NetworkId(2n, 'TESTNET');

  private constructor(
    public readonly id: bigint,
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
    switch (BigInt(id)) {
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
