Feature: Token Split and Transfer
  As a token owner with payment assets
  I want to split tokens and transfer the resulting parts
  So that I can distribute value to multiple recipients

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token with 2 payment assets worth 100 and 200

  Scenario: Split and transfer parts to different users
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    And Alice transfers split token 2 to Carol
    Then Bob's token passes verification
    And Carol's token passes verification

  Scenario: Recipient can further transfer a received split token
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    Then Bob can transfer split token 1 to Carol
    And Carol's received token passes verification

  Scenario: Double-spend of a split token is prevented
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    Then Alice cannot transfer split token 1 to Carol because it was already sent

  Scenario: Original token cannot be used after split burn
    When Alice splits the token into 2 parts
    Then Alice cannot transfer the original token because it was burned

  Scenario: Multi-level split - split a token that was already split
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    And Bob splits his token into 2 sub-parts
    Then 2 sub-split tokens are created
    And each sub-split token passes verification

  Scenario: Multi-level split with transfer across 4 levels
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    And Bob splits his token into 2 sub-parts
    And Bob transfers sub-split token 1 to Carol
    And Carol transfers sub-split token 1 to Dave
    Then Dave's token passes verification
    And Dave's token has the correct asset values

  Scenario: Double-spend after multi-level split is prevented
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    And Bob splits his token into 2 sub-parts
    And Bob transfers sub-split token 1 to Carol
    Then Bob cannot transfer sub-split token 1 to Dave because it was already sent

  Scenario: Cannot spend a token after it has been split
    When Alice splits the token into 2 parts
    And Alice transfers split token 1 to Bob
    And Bob splits his token into 2 sub-parts
    Then Bob cannot transfer the pre-split token because it was burned
