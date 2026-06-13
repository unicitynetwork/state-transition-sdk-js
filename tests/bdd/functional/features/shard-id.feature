Feature: ShardId codec and bit operations
  As a maintainer of the state transition SDK
  I want the ShardId type to round-trip and answer bit queries correctly
  So that bft-shard verification and routing both rely on the same primitive

  # T4-01: BVA — encode/decode roundtrip across the lengths that matter
  Scenario Outline: ShardId roundtrips at length <length>
    Given a ShardId encoded as "<hex>"
    When the ShardId is decoded
    Then the ShardId length is <length>
    And re-encoding the ShardId produces "<hex>"

    Examples:
      | length | hex      |
      | 0      | 0x80     |
      | 1      | 0x40     |
      | 1      | 0xC0     |
      | 2      | 0xA0     |
      | 3      | 0xB0     |
      | 8      | 0x0080   |

  # T4-02: EP — isPrefixOf accepts data sharing the bit prefix
  Scenario Outline: ShardId isPrefixOf accepts matching data
    Given a ShardId encoded as "<shardHex>"
    And data starting with "<dataPrefixHex>"
    When isPrefixOf is checked
    Then isPrefixOf returns true

    Examples:
      | shardHex | dataPrefixHex |
      | 0x80     | 0x00          |
      | 0x40     | 0x00          |
      | 0x40     | 0x3F          |
      | 0xC0     | 0x80          |
      | 0xC0     | 0xFF          |

  # T4-03: Branch Coverage — isPrefixOf rejects on a partial-byte boundary
  Scenario: ShardId isPrefixOf rejects on partial-byte boundary
    Given a ShardId encoded as "0xC0"
    And data starting with "0x40"
    When isPrefixOf is checked
    Then isPrefixOf returns false

  # T4-04: BVA — getBit at boundaries; throws past length
  Scenario: ShardId getBit returns expected bits and rejects out-of-bounds
    Given a ShardId encoded as "0xB0"
    When the ShardId is decoded
    Then getBit at index 0 returns 1
    And getBit at index 1 returns 0
    And getBit at index 2 returns 1
    And getBit at index -1 throws "out of bounds"
    And getBit at index 3 throws "out of bounds"

  # T4-05: Error Guessing — empty input is rejected
  Scenario: ShardId decode rejects empty input
    Given a ShardId encoded as "0x"
    When the ShardId is decoded
    Then decoding throws with message containing "empty input"

  # T4-06: Error Guessing — last byte without the trailing-1 marker is rejected
  Scenario: ShardId decode rejects last byte without trailing-1 marker
    Given a ShardId encoded as "0x00"
    When the ShardId is decoded
    Then decoding throws with message containing "end marker"
