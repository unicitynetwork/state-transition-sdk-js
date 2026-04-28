@bft-shard-only
Feature: bft-shard MSB routing
  As a maintainer of the state transition SDK
  I want the test-side ShardAwareAggregatorClient to mimic the future routing service
  So that we can run the full BDD suite against bft-shard topologies before that service exists

  # T4-29: Decision Table — MSB routing extracts the top SHARD_ID_LENGTH bits of the StateID
  # and ORs them with (1 << SHARD_ID_LENGTH) to produce the picked shard ID. Topology-agnostic:
  # works for any SHARD_ID_LENGTH (2 shards / 4 shards / 8 shards / ...).
  Scenario Outline: MSB routing of a StateID with first byte "<firstByteHex>" picks the shard whose prefix matches the StateID
    Given a synthetic StateID whose first byte is "<firstByteHex>"
    When ShardAwareAggregatorClient.getShardForStateId runs in msb mode against the configured topology
    Then the picked shard's prefix matches the StateID's top SHARD_ID_LENGTH bits

    Examples:
      | firstByteHex |
      | 0x00         |
      | 0x40         |
      | 0x80         |
      | 0xC0         |
      | 0xFF         |

  # T4-30: Risk-Based — submitting to the wrong shard is rejected by the aggregator's ValidateShardID.
  # Topology-agnostic: mint a token, ask the helper which shard owns it, then resubmit to any
  # other configured shard.
  Scenario: Submitting a finalised certification to a different shard is rejected
    Given a mock aggregator client is set up
    And a freshly minted token routed to its correct shard
    When the same certification request is sent directly to a different shard
    Then the aggregator rejects the request

  # T4-31: Use Case — under correct routing, mints land on every configured shard.
  # 8 * shardCount mints — enough that P(missing any single shard) is < 0.05% even for 4 shards
  # (each shard has 0.95% chance of being skipped under uniform random routing).
  Scenario: Mints under MSB routing reach every configured shard
    Given a mock aggregator client is set up
    When enough tokens are minted to cover every configured shard
    Then the per-shard submission count covers every configured shard
