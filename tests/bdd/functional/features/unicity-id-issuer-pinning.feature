Feature: Unicity-ID mint genesis issuer pinning

  # PR #114 / issue #113: a received unicity-id (nametag) token can now be verified against
  # the expected issuer's public key, not just for a valid inclusion proof. The pin is
  # optional on CertifiedUnicityIdMintTransactionVerificationRule.verify(...) (pass null on
  # the local-mint path where you authored the genesis); UnicityIdToken.verify(...) always
  # pins, since you only call it on a token you received from someone else.

  Background:
    Given a mock aggregator client is set up
    And Alice has registered a nametag token

  Scenario: Verifying the nametag against its true issuer succeeds
    When the nametag token is verified against its genesis lock-script issuer
    Then the unicity-id verification result is OK

  Scenario: Verifying the nametag against a wrong issuer fails with a descriptive message
    When the nametag token is verified against an unrelated issuer public key
    Then the unicity-id verification result is FAIL
    And the unicity-id failure message contains "Lock script does not match expected unicity-id issuer"

  Scenario: The verification rule with no issuer pin (local-mint path) succeeds
    When the genesis is verified by the rule with no issuer pin
    Then the unicity-id verification result is OK

  Scenario: The verification rule with the matching issuer pin succeeds
    When the genesis is verified by the rule with the true issuer pin
    Then the unicity-id verification result is OK

  Scenario: The verification rule with a wrong issuer pin fails
    When the genesis is verified by the rule with an unrelated issuer pin
    Then the unicity-id verification result is FAIL
    And the unicity-id failure message contains "Lock script does not match expected unicity-id issuer"
