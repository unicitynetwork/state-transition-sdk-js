Feature: Token Long Transfer Chain
  As a user of the state transition SDK
  I want long transfer chains to verify correctly
  So that tokens maintain integrity through many transfers

  Background:
    Given a mock aggregator client is set up
    And the following users are registered:
      | name  |
      | Alice |
      | Bob   |
    And "Alice" has a minted token

  # T2-03: long-transfer-chain (BVA + Loop Testing)
  Scenario: Token survives 10-hop transfer chain
    When the token is transferred 10 times between "Alice" and "Bob"
    Then the token should have 10 transactions in its history
    And the token should pass verification

  @nametag-standard
  Scenario Outline: Mint entry via <method> then 4-hop pubkey chain
    Given Alice has a signing key
    And Bob has a signing key
    And Carol has a signing key
    And Dave has a signing key
    And Bob has registered the nametag "@bob" in domain "bdd/test"
    When Alice mints a new token addressed to Bob via <method>
    And Bob transfers the token to Alice via pubkey
    And Alice transfers the token to Carol via pubkey
    And Carol transfers the token to Dave via pubkey
    Then the current token verifies
    And the current token can be spent by Dave

    Examples:
      | method  |
      | pubkey  |
      | nametag |
