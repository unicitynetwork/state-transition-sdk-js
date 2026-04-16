import { AggregatorClient } from '../../../../src/api/AggregatorClient.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationResponse } from '../../../../src/api/CertificationResponse.js';
import { IAggregatorClient } from '../../../../src/api/IAggregatorClient.js';
import { InclusionProofResponse } from '../../../../src/api/InclusionProofResponse.js';
import { StateId } from '../../../../src/api/StateId.js';

/**
 * An {@link IAggregatorClient} decorator that transparently routes requests
 * to the correct shard aggregator based on the {@link StateId}.
 *
 * Uses the least-significant bits of the StateId imprint to determine the shard,
 * mirroring the Java SDK's ShardAwareAggregatorClient routing logic.
 */
export class ShardAwareAggregatorClient implements IAggregatorClient {
  private readonly shardIdLength: number;
  private readonly shardMap: Map<number, AggregatorClient>;

  public constructor(shardIdLength: number, shardMap: Map<number, AggregatorClient>) {
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

  public async submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    const stateId = await StateId.fromCertificationData(certificationData);
    const shardId = ShardAwareAggregatorClient.getShardForStateId(stateId, this.shardIdLength);
    const client = this.shardMap.get(shardId)!;
    return client.submitCertificationRequest(certificationData);
  }

  public async getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    const shardId = ShardAwareAggregatorClient.getShardForStateId(stateId, this.shardIdLength);
    const client = this.shardMap.get(shardId)!;
    return client.getInclusionProof(stateId);
  }

  public static getShardForStateId(stateId: StateId, shardIdLength: number): number {
    const imprint = stateId.imprint; // 2-byte algo prefix + 32-byte hash
    const len = imprint.length;
    const lsb32 =
      ((imprint[len - 4] << 24) | (imprint[len - 3] << 16) | (imprint[len - 2] << 8) | imprint[len - 1]) >>> 0;
    const shardBits = lsb32 & ((1 << shardIdLength) - 1);
    return (1 << shardIdLength) | shardBits;
  }
}
