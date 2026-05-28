/**
 * Unicity network identifier (α). Used to scope token ids and other
 * network-bound values so they cannot be replayed across networks.
 */
export class NetworkId {
  public static readonly LOCAL = new NetworkId(3, 'LOCAL');
  public static readonly MAINNET = new NetworkId(1, 'MAINNET');
  public static readonly TESTNET = new NetworkId(2, 'TESTNET');

  private constructor(
    public readonly id: number,
    private readonly name?: string,
  ) {}

  /**
   * Resolve a NetworkId from its numeric identifier. Returns the registered
   * singleton for known ids; constructs a new (unnamed) instance for any
   * other value in the 16-bit unsigned range.
   *
   * @param {number|bigint} id Numeric network identifier.
   * @returns {NetworkId} NetworkId for the given identifier.
   * @throws {Error} If `id` is outside the 16-bit unsigned range.
   */
  public static fromId(id: number | bigint): NetworkId {
    const value = BigInt(id);
    if (value < 0n || value > 0xffffn) {
      throw new Error(`Network identifier out of 16-bit unsigned range: ${id}.`);
    }
    const numeric = Number(value);
    switch (numeric) {
      case NetworkId.MAINNET.id:
        return NetworkId.MAINNET;
      case NetworkId.TESTNET.id:
        return NetworkId.TESTNET;
      case NetworkId.LOCAL.id:
        return NetworkId.LOCAL;
      default:
        return new NetworkId(numeric);
    }
  }

  /**
   * Equality check against another NetworkId.
   *
   * @param {NetworkId} other Other network identifier.
   * @returns {boolean} True if both share the same numeric id.
   */
  public equals(other: NetworkId): boolean {
    return this.id === other.id;
  }

  /**
   * @returns {string} `NetworkId[<name>]` for registered networks, `NetworkId[<id>]` otherwise.
   */
  public toString(): string {
    return `NetworkId[${this.name ?? this.id}]`;
  }
}
