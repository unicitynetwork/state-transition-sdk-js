Feature: UnicityIdPredicateVerifier — verifying tokens locked to a nametag

  # PR #114 / issue #113: UnicityIdPredicateVerifier now takes an issuerPublicKey, and it is
  # no longer part of the default verifier set. A consumer that wants to verify tokens locked
  # to a `UnicityIdPredicate` ("whoever owns @name") must construct it directly:
  #   new UnicityIdPredicateVerifier(predicateVerifierService, trustBase, issuerPublicKey)
  # (it cannot be reached through PredicateVerifierService.create()). This feature exercises
  # the verifier directly against a real nametag + a token locked to it.

  Background:
    Given a mock aggregator client is set up
    And Alice has registered a nametag, and a token locked to that nametag

  Scenario: A transfer unlocked by the nametag owner verifies OK with the true issuer
    When the unicity-id-locked transfer is verified with the true nametag issuer
    Then the unicity-id verification result is OK

  Scenario: The same transfer fails verification with a wrong issuer
    When the unicity-id-locked transfer is verified with an unrelated issuer
    Then the unicity-id verification result is FAIL
    And the unicity-id failure message contains "Could not verify unicity id token"

  Scenario: A transfer signed by someone other than the nametag owner fails
    When the unicity-id-locked transfer is unlocked by a non-owner and verified with the true issuer
    Then the unicity-id verification result is FAIL
    And the unicity-id failure message contains "Could not verify target predicate"

  Scenario: A wrong-tag unlock script (nametag for a different name) fails with a token-id mismatch
    When the unicity-id-locked transfer is unlocked with an unrelated nametag and verified with the true issuer
    Then the unicity-id verification result is FAIL
    And the unicity-id failure message contains "Token ID mismatch"
