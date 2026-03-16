Feature: Token Split - Advanced Scenarios
  As a token owner with payment assets
  I want to split and transfer tokens with full flexibility
  So that I can distribute value to multiple recipients

  Background:
    Given a mock aggregator client is set up
    And the following users are registered:
      | name  |
      | Alice |
      | Bob   |
      | Carol |
      | Dave  |
    And "Alice" has a minted token with assets worth 100 and 200

  Scenario: Split token and transfer parts to different users
    When "Alice" splits the token into 2 parts with values 60/40 and 120/80
    And "Alice" transfers split token 1 to "Bob"
    And "Alice" transfers split token 2 to "Carol"
    Then "Bob" should own split token 1
    And "Carol" should own split token 2
    And both split tokens should pass verification

  Scenario: Recipient can transfer a received split token
    When "Alice" splits the token into 2 parts with values 60/40 and 120/80
    And "Alice" transfers split token 1 to "Bob"
    And "Bob" transfers his split token to "Carol"
    Then "Carol" should own the transferred split token
    And the transferred split token should pass verification

  Scenario: Multi-level split - split a received split token
    When "Alice" splits the token into 2 parts with values 60/40 and 120/80
    And "Alice" transfers split token 1 to "Bob"
    And "Bob" splits his token into 2 sub-parts with values 30/30 and 60/60
    Then 2 sub-split tokens should be created
    And each sub-split token should pass verification

  Scenario: CBOR round-trip preserves split token
    When "Alice" splits the token into 2 parts with values 60/40 and 120/80
    And split token 1 is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported split token should have the same ID
    And the imported split token should pass verification

  Scenario: Non-owner cannot split another user's token
    When "Alice" transfers the token to "Bob"
    And "Alice" tries to split "Bob"'s token
    Then the split should fail with predicate mismatch

  Scenario: Cannot transfer original token after split
    When "Alice" splits the token into 2 parts with values 60/40 and 120/80
    And "Alice" tries to transfer the original token to "Bob"
    Then the transfer should fail because the token was burned
