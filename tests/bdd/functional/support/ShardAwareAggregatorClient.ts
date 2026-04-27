import { AggregatorClient } from '../../../../src/api/AggregatorClient.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationResponse } from '../../../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../../../src/api/InclusionProofResponse.js';
import { StateId } from '../../../../src/api/StateId.js';

export type ShardRoutingMode = 'lsb' | 'msb';

/**
 * An {@link IAggregatorClient} decorator that routes requests to the correct
 * shard aggregator based on the {@link StateId}.
 *
 * Two routing modes are supported:
 * - 'lsb' — least-significant bits of the StateId hash. Used by the legacy
 *   parent/child sharding mode, mirroring the Java SDK's helper.
 * - 'msb' — most-significant bits of the StateId raw 32-byte data. Used by
 *   the bft-shard mode introduced in aggregator PR #146; matches the
 *   aggregator's ValidateShardID admission rule.
 */
export class ShardAwareAggregatorClient implements IAggregatorClient {
  private readonly routingMode: ShardRoutingMode;
  private readonly shardIdLength: number;
  private readonly shardMap: Map<number, AggregatorClient>;

  public constructor(
    shardIdLength: number,
    shardMap: Map<number, AggregatorClient>,
    routingMode: ShardRoutingMode = 'lsb',
  ) {
    this.routingMode = routingMode;
    this.shardIdLength = shardIdLength;
    this.shardMap = shardMap;

    const baseId = 1 << shardIdLength;
    const expectedCount = 1 << shardIdLength;
    for (let i = 0; i < expectedCount; i++) {
      const shardId = baseId + i;
      if (!shardMap.has(shardId)) {
        throw new Error(
          `Missing client for shard ID ${shardId}. Expected all shard IDs from ${baseId} to ${baseId + expectedCount - 1}`,
        );
      }
    }
  }

  public static getShardForStateId(
    stateId: StateId,
    shardIdLength: number,
    routingMode: ShardRoutingMode = 'lsb',
  ): number {
    if (shardIdLength === 0) {
      return 1;
    }

    if (routingMode === 'msb') {
      const data = stateId.data;
      let shardBits = 0;
      let consumed = 0;
      let byteIdx = 0;
      while (consumed < shardIdLength) {
        const remaining = shardIdLength - consumed;
        const take = Math.min(8, remaining);
        const byteVal = data[byteIdx];
        const top = byteVal >>> (8 - take);
        shardBits = (shardBits << take) | top;
        consumed += take;
        byteIdx += 1;
      }
      return (1 << shardIdLength) | shardBits;
    }

    const imprint = stateId.imprint;
    const len = imprint.length;
    const lsb32 =
      ((imprint[len - 4] << 24) | (imprint[len - 3] << 16) | (imprint[len - 2] << 8) | imprint[len - 1]) >>> 0;
    const shardBits = lsb32 & ((1 << shardIdLength) - 1);
    return (1 << shardIdLength) | shardBits;
  }

  public async getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    const shardId = ShardAwareAggregatorClient.getShardForStateId(stateId, this.shardIdLength, this.routingMode);
    const client = this.shardMap.get(shardId)!;
    return await client.getInclusionProof(stateId);
  }

  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    const stateId = await StateId.fromCertificationData(certificationData);
    const shardId = ShardAwareAggregatorClient.getShardForStateId(stateId, this.shardIdLength, this.routingMode);
    const client = this.shardMap.get(shardId)!;
    return client.submitCertificationRequest(certificationData);
  }
}
