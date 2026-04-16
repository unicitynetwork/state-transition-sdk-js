Feature: Token Transfer
  As a token owner
  I want to transfer my tokens to other users
  So that I can exchange digital assets

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario: Owner transfers token to another user
    Given Bob is a registered user
    When Alice transfers the token to Bob
    Then the transfer certification succeeds
    And the token is finalized

  Scenario: Transferred token passes verification
    Given Bob is a registered user
    When Alice transfers the token to Bob
    Then the transferred token passes verification

  Scenario: Token can be transferred through chain of owners
    Given Bob is a registered user
    When Alice transfers the token to Bob
    And Bob transfers the token back to Alice
    Then the final token passes verification

  @nametag-standard
  Scenario Outline: Owner transfers token addressed via <method>
    Given Alice has a signing key
    And Bob has a signing key
    And Alice has registered the nametag "@alice" in domain "bdd/test"
    And Bob has registered the nametag "@bob" in domain "bdd/test"
    When Alice mints a new token addressed to Bob via pubkey
    And Bob transfers the token to Alice via <method>
    Then the certification response status is "SUCCESS"
    And the current token verifies
    And the current token can be spent by Alice

    Examples:
      | method  |
      | pubkey  |
      | nametag |
