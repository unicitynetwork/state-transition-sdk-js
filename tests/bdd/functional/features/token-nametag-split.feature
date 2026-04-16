soFeature: Nametag-addressed split children
  As a payer who fans out value to several recipients
  I want split children to be addressable by nametag just like plain transfers
  So that the same addressing story applies end-to-end

  Background:
    Given a mock aggregator client is set up
    And Alice has a signing key
    And Bob has a signing key
    And Carol has a signing key

  @nametag-standard
  Scenario Outline: Split child 1 is routed to Bob via <method>
    Given Bob has registered the nametag "@bob" in domain "bdd/test"
    When Alice splits a 2-asset token and sends child 1 to Bob via <method>
    Then the current token verifies
    And the current token can be spent by Bob

    Examples:
      | method  |
      | pubkey  |
      | nametag |

  @nametag-standard
  Scenario Outline: Mixed-recipient split — child 1 via <bobMethod>, child 2 via <carolMethod>
    Given Bob has registered the nametag "@bob" in domain "bdd/test"
    And Carol has registered the nametag "@carol" in domain "bdd/test"
    When Alice splits a 2-asset token, sends child 1 to Bob via <bobMethod>, and child 2 to Carol via <carolMethod>
    # Each recipient holds their own child — this exercises the full
    # (bobMethod x carolMethod) cross-product.

    Examples:
      | bobMethod | carolMethod |
      | pubkey    | pubkey      |
      | pubkey    | nametag     |
      | nametag   | pubkey      |
      | nametag   | nametag     |

  @nametag-critical
  Scenario Outline: Two-level split with mixed addressing (entry <entry>, grandchild <grandchild>)
    Given Bob has registered the nametag "@bob" in domain "bdd/test"
    And Carol has registered the nametag "@carol" in domain "bdd/test"
    When Alice splits a 2-asset token and sends child 1 to Bob via <entry>
    And after the split, Bob splits his child again and sends grandchild 1 to Carol via <grandchild>
    Then the current token verifies
    And the current token can be spent by Carol

    Examples:
      | entry   | grandchild |
      | pubkey  | pubkey     |
      | pubkey  | nametag    |
      | nametag | pubkey     |
      | nametag | nametag    |
