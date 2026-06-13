Feature: Shard-routing byte source regression
  As a maintainer of the state transition SDK
  I want the routing helper to read from byte 0 of stateId.data — never the last byte, never the imprint —
  So that we don't silently regress to the pre-#141 byte-31 LSB convention or route via the algorithm-prefix byte.

  # T4-38: pre-#141 LSB read from the LAST byte of the imprint (via big.Int.SetBytes).
  # Post-#141 (and our SDK after the byte-0 fix) reads from byte 0 of the raw 32-byte data.
  # This scenario constructs a StateID where data[0] LSB and data[31] LSB disagree;
  # the new code must pick shard 2 (data[0] LSB=0); the old code would have picked shard 3.
  Scenario: LSB routing reads from byte 0 of stateId.data, not byte 31
    Given a synthetic StateID with byte 0 "0x00" and byte 31 "0x01"
    When ShardAwareAggregatorClient.getShardForStateId runs in lsb mode with shardIdLength 1
    Then the picked shard equals 2

  # T4-39: symmetric pin for the MSB path. Same byte source (data[0]); only the bit
  # direction differs. data[0]=0x80 means top bit = 1 → shard 3. data[31] is set to 0
  # so a buggy variant that read the last byte would (statistically) get a different
  # answer for at least some inputs and have us catch the drift.
  Scenario: MSB routing reads from byte 0 of stateId.data, not byte 31
    Given a synthetic StateID with byte 0 "0x80" and byte 31 "0x00"
    When ShardAwareAggregatorClient.getShardForStateId runs in msb mode with shardIdLength 1
    Then the picked shard equals 3

  # T4-40: defense in depth — any input must yield a shard ID that's a valid
  # configured-shard ID (i.e. 2 or 3 for shardIdLength=1), never something else.
  Scenario Outline: Routing always returns a configured shard ID for shardIdLength 1
    Given a synthetic StateID with byte 0 "<byte0>" and byte 31 "<byte31>"
    When ShardAwareAggregatorClient.getShardForStateId runs in <mode> mode with shardIdLength 1
    Then the picked shard is one of "2,3"

    Examples:
      | byte0 | byte31 | mode |
      | 0x00  | 0xFF   | lsb  |
      | 0xFF  | 0x00   | lsb  |
      | 0x00  | 0xFF   | msb  |
      | 0xFF  | 0x00   | msb  |
