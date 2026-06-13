Feature: Mixed addressing — nametag and pubkey in the same token lifetime
  Regression surface for Sphere-style flows where entry and continuation
  use different addressing methods.

  Background:
    Given a mock aggregator client is set up

  @nametag-critical
  Scenario Outline: 4-hop transfer chain runs under addressing sequence <seq>
    When a 4-hop transfer chain runs using addressing sequence "<seq>"
    Then the current token verifies

    Examples:
      | seq                                 |
      | pubkey, pubkey, pubkey, pubkey      |
      | nametag, pubkey, pubkey, pubkey     |
      | pubkey, nametag, pubkey, pubkey     |
      | pubkey, pubkey, nametag, pubkey     |
      | pubkey, pubkey, pubkey, nametag     |
      | nametag, nametag, pubkey, pubkey    |
      | nametag, pubkey, nametag, pubkey    |
      | pubkey, nametag, nametag, pubkey    |
      | nametag, nametag, nametag, nametag  |
      | nametag, pubkey, pubkey, nametag    |

  @nametag-standard
  Scenario Outline: 2-hop chain, <seq>
    When a 2-hop transfer chain runs using addressing sequence "<seq>"
    Then the current token verifies

    Examples:
      | seq              |
      | nametag, pubkey  |
      | pubkey, nametag  |
