Feature: ShardIdMatchesStateIdRule
  As a maintainer of the state transition SDK
  I want the shard-id-vs-state-id rule to accept matching prefixes and reject mismatches
  So that misrouted proofs cannot pass verification under bft-shard mode

  # T4-16: EP — length=0 short-circuits to OK regardless of StateID
  Scenario: ShardId of length 0 always returns OK
    Given a ShardId encoded as "0x80"
    And a StateID with first byte "0x12"
    When ShardIdMatchesStateIdRule.verify runs
    Then the rule status is "OK"

  # T4-17: Branch Coverage — byte-aligned matching prefix accepted
  Scenario: Byte-aligned matching prefix returns OK
    Given a ShardId encoded as "0x3580" describing 8 bits
    And a StateID with first byte "0x35"
    When ShardIdMatchesStateIdRule.verify runs
    Then the rule status is "OK"

  # T4-18: Branch Coverage — byte-aligned mismatch rejected
  Scenario: Byte-aligned mismatching prefix returns FAIL
    Given a ShardId encoded as "0x3580" describing 8 bits
    And a StateID with first byte "0x36"
    When ShardIdMatchesStateIdRule.verify runs
    Then the rule status is "FAIL"

  # T4-19: Risk-Based — partial-byte match (length=9) accepted (PR #111 fix territory)
  Scenario: Partial-byte matching prefix at length 9 returns OK
    Given a ShardId encoded as "0xC040" describing 9 bits
    And a StateID with first two bytes "0xC000"
    When ShardIdMatchesStateIdRule.verify runs
    Then the rule status is "OK"

  # T4-20: Risk-Based — partial-byte mismatch (length=9) rejected (PR #111 fix territory)
  Scenario: Partial-byte mismatching prefix at length 9 returns FAIL
    Given a ShardId encoded as "0xC040" describing 9 bits
    And a StateID with first two bytes "0xC080"
    When ShardIdMatchesStateIdRule.verify runs
    Then the rule status is "FAIL"
