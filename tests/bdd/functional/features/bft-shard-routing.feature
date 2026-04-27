@bft-shard-only
Feature: bft-shard MSB routing
  As a maintainer of the state transition SDK
  I want the test-side ShardAwareAggregatorClient to mimic the future routing service
  So that we can run the full BDD suite against bft-shard topologies before that service exists

  # T4-29: Decision Table — MSB routing maps top-bit-0 to shard0 and top-bit-1 to shard1
  Scenario Outline: MSB routing of a <topBit>-bit-prefix StateID picks shard <expectedShardId>
    Given a synthetic StateID whose first byte is "<firstByteHex>"
    When ShardAwareAggregatorClient.getShardForStateId runs in "msb" mode with shardIdLength 1
    Then the picked shard is <expectedShardId>

    Examples:
      | topBit | firstByteHex | expectedShardId |
      | 0      | 0x00         | 2               |
      | 0      | 0x7F         | 2               |
      | 1      | 0x80         | 3               |
      | 1      | 0xFF         | 3               |

  # T4-30: Risk-Based — submitting to the wrong shard is rejected by the aggregator's ValidateShardID
  Scenario: Submitting a top-bit-1 StateID to shard0 is rejected with a shard-mismatch error
    Given a mock aggregator client is set up
    And a freshly minted token whose StateID would route to shard 3
    When the same certification request is sent directly to shard 2
    Then the aggregator rejects the request with a shard-related error

  # T4-31: Use Case — under correct routing the suite mints to both shards
  Scenario: A round of 4 mints under MSB routing reaches both shards
    Given a mock aggregator client is set up
    When 4 tokens are minted in a row
    Then the per-shard submission count for both shards is greater than 0
