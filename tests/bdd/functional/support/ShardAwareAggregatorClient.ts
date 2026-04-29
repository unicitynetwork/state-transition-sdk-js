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

    const data = stateId.data;

    if (routingMode === 'msb') {
      // MSB mode: read top bits of byte 0 first, then byte 1, etc.
      let shardBits = 0;
      let consumed = 0;
      let byteIdx = 0;
      while (consumed < shardIdLength) {
        const remaining = shardIdLength - consumed;
        const take = Math.min(8, remaining);
        const top = data[byteIdx] >>> (8 - take);
        shardBits = (shardBits << take) | top;
        consumed += take;
        byteIdx += 1;
      }
      return (1 << shardIdLength) | shardBits;
    }

    // LSB mode: bit-by-bit, LSB-first across bytes starting at byte 0.
    // Byte-for-byte mirror of aggregator-go's pkg/api/shard_match.go
    // MatchesShardPrefix:
    //   actual := (keyBytes[d/8] >> (uint(d) % 8)) & 1
    let shardBits = 0;
    for (let d = 0; d < shardIdLength; d++) {
      const bit = (data[d >>> 3] >>> (d & 7)) & 1;
      shardBits |= bit << d;
    }
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
