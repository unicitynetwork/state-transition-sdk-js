Feature: Nametag-addressed tokens (Unicity ID, option 1)
  As an SDK consumer
  I want to address tokens to a human-readable @name
  So that senders can resolve recipients without exchanging raw pubkeys

  Background:
    Given a mock aggregator client is set up
    And Alice has a signing key
    And Bob has a signing key

  @nametag-critical
  Scenario: Alice registers a nametag and it verifies
    Given Alice has registered the nametag "@alice" in domain "bdd/test"
    # Registration is proven by the Given step itself; no further assertion needed
    # because registerNametag() in the helper calls UnicityIdToken.mint which
    # internally runs verify().

  @nametag-critical
  Scenario Outline: Bob sends a token to Alice addressed via <method>
    Given Alice has registered the nametag "@alice" in domain "bdd/test"
    When Bob mints a new token addressed to Alice via <method>
    Then the certification response status is "SUCCESS"
    And the current token verifies
    And the current token can be spent by Alice

    Examples:
      | method  |
      | pubkey  |
      | nametag |

  @nametag-critical
  Scenario: Nametag bytes do not appear in the minted token's CBOR
    Given Alice has registered the nametag "@alice" in domain "bdd/test"
    When Bob mints a new token addressed to Alice via nametag
    Then the current token verifies
    And the current token's CBOR does not contain the bytes of "@alice"
