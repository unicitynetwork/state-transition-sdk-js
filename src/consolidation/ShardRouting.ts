import { ConsolidationError } from './ConsolidationError.js';
import { IShardConfigurationPin, PartitionView } from '../api/bft/PartitionView.js';
import { ShardId } from '../api/bft/ShardId.js';
import { IBatchAggregatorClient, isBatchAggregatorClient } from '../api/IBatchAggregatorClient.js';
import { StateId } from '../api/StateId.js';

/**
 * Aggregator of one shard, configured by the application. URLs and credentials live in the client the application
 * built; nothing a token or a response says can add or replace an endpoint.
 *
 * The client must have the batch capability: consolidation cannot work without it, and a routing is static trusted
 * configuration, so this is checked when the routing is built (types for TypeScript callers, a runtime check for
 * JavaScript ones), not when a token is consolidated.
 */
export interface IShardEndpoint {
  readonly client: IBatchAggregatorClient;
  readonly shard: ShardId;
}

/**
 * Trusted routing configuration of one partition. The network is the one of the verification context's trust base.
 */
export interface IShardRoutingOptions {
  /** Endpoints of the shards that may take part. Their ids must be shards of the scheme. */
  readonly endpoints: readonly IShardEndpoint[];
  /** Partition id the application expects (nonzero 32-bit). The caller's intent, never inferred from a response. */
  readonly partitionId: bigint;
  /** Complete sharding scheme of the partition: empty for a single shard partition. */
  readonly scheme: readonly ShardId[];
  /**
   * Optional pinned configuration hash per shard, a stricter policy. Every shard must be in the scheme, at most once,
   * every hash 32 bytes; anything else is rejected when the routing is built, never silently ignored.
   */
  readonly shardConfigurationPins?: readonly IShardConfigurationPin[];
}

/**
 * Immutable routing from a state id to its shard endpoint, from the admitted shard prefix topology. No modulo rule,
 * no inference from timestamps. Invalid configurations (incomplete or overlapping scheme, endpoints without the batch
 * capability or outside the scheme, duplicates, malformed pins) are rejected at construction.
 */
export class ShardRouting {
  public readonly partitionId: bigint;
  private readonly _order: readonly ShardId[];
  private readonly _pins: readonly IShardConfigurationPin[] | undefined;
  private readonly _scheme: readonly ShardId[];
  private readonly endpoints: readonly IShardEndpoint[];

  /**
   * @param {IShardRoutingOptions} options Routing configuration.
   * @throws {ConsolidationError} `input` if the configuration is invalid.
   */
  public constructor(options: IShardRoutingOptions) {
    const input = (message: string, cause?: unknown): ConsolidationError =>
      new ConsolidationError('input', message, { cause, outcome: 'invalid_input' });

    if (options.partitionId <= 0n || options.partitionId > 0xffffffffn) {
      throw input('Partition id must be a nonzero 32-bit unsigned integer.');
    }
    let order: ShardId[];
    try {
      order = PartitionView.canonicalShardOrder(options.scheme);
    } catch (e) {
      throw input(`Invalid sharding scheme: ${e instanceof Error ? e.message : String(e)}`, e);
    }
    const label = (shard: ShardId): string => (shard.length === 0 ? '(root)' : shard.toString());
    const seen = new Set<string>();
    for (const endpoint of options.endpoints) {
      const key = endpoint.shard.toString();
      if (!order.some((id) => id.equals(endpoint.shard))) {
        throw input(`Endpoint shard "${label(endpoint.shard)}" is not in the scheme.`);
      }
      if (seen.has(key)) {
        throw input(`Duplicate endpoint for shard "${label(endpoint.shard)}".`);
      }
      if (!isBatchAggregatorClient(endpoint.client)) {
        throw input(
          `Endpoint of shard "${label(endpoint.shard)}" has no getInclusionProofs: consolidation needs get_inclusion_proofs.v1.`,
        );
      }
      seen.add(key);
    }
    if (options.endpoints.length === 0) {
      throw input('At least one endpoint is required.');
    }
    const pinned = new Set<string>();
    for (const pin of options.shardConfigurationPins ?? []) {
      const key = pin.shard.toString();
      if (!order.some((id) => id.equals(pin.shard))) {
        throw input(`Pinned shard "${label(pin.shard)}" is not in the scheme.`);
      }
      if (pinned.has(key)) {
        throw input(`Shard "${label(pin.shard)}" is pinned more than once.`);
      }
      if (pin.hash.length !== 32) {
        throw input(`The pinned configuration hash of shard "${label(pin.shard)}" must be 32 bytes.`);
      }
      pinned.add(key);
    }

    this.partitionId = options.partitionId;
    this._order = order;
    this._scheme = options.scheme.map((id) => ShardId.decode(id.encode()));
    this.endpoints = options.endpoints.slice();
    this._pins = options.shardConfigurationPins?.map((pin) => ({
      hash: new Uint8Array(pin.hash),
      shard: ShardId.decode(pin.shard.encode()),
    }));
  }

  /**
   * @returns {ShardId[]} The shards of the scheme in canonical (left to right) order; one root shard if unsharded.
   */
  public get order(): ShardId[] {
    return this._order.slice();
  }

  /**
   * @returns {ShardId[]} Copy of the configured scheme.
   */
  public get scheme(): ShardId[] {
    return this._scheme.slice();
  }

  /**
   * @returns {IShardConfigurationPin[]|undefined} Copies of the pinned configuration hashes, if configured.
   */
  public get shardConfigurationPins(): IShardConfigurationPin[] | undefined {
    return this._pins?.map((pin) => ({ hash: new Uint8Array(pin.hash), shard: pin.shard }));
  }

  /**
   * Routing of a single shard partition served by one endpoint.
   *
   * @param {IBatchAggregatorClient} client Client of the shard aggregator.
   * @param {bigint} partitionId Partition id.
   * @returns {ShardRouting} Routing.
   */
  public static single(client: IBatchAggregatorClient, partitionId: bigint): ShardRouting {
    return new ShardRouting({ endpoints: [{ client, shard: ShardId.ROOT }], partitionId, scheme: [] });
  }

  /**
   * @param {StateId} stateId State id.
   * @returns {IShardEndpoint} Endpoint serving the state's shard.
   * @throws {ConsolidationError} `input` if no configured endpoint serves the state.
   */
  public route(stateId: StateId): IShardEndpoint {
    for (const endpoint of this.endpoints) {
      if (endpoint.shard.length === 0 || endpoint.shard.isPrefixOf(stateId.data)) {
        return endpoint;
      }
    }
    throw new ConsolidationError('input', `No configured endpoint serves ${stateId.toString()}.`, {
      outcome: 'invalid_input',
    });
  }
}
