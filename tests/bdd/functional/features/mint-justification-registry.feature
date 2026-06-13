Feature: MintJustificationVerifierService dispatches by CBOR tag

  # PR #110 406f890 — the new verifier service is a tag→verifier registry.
  # This feature pins its dispatch behaviour: known tag dispatches, duplicate registration
  # throws, unknown tag returns a clean FAIL, no-justification returns OK.

  Background:
    Given a mock aggregator client is set up

  Scenario: A transaction with no justification verifies as OK
    Given a fresh MintJustificationVerifierService is created
    When verify is invoked on a CertifiedMintTransaction with null justification
    Then the result status is OK

  Scenario: A duplicate tag registration throws
    Given a fresh MintJustificationVerifierService is created
    And a SplitMintJustificationVerifier is registered
    When a second verifier with the same tag is registered
    Then the registration error message contains "Duplicate"

  Scenario: An unknown justification tag yields a FAIL with a descriptive message
    Given a fresh MintJustificationVerifierService is created
    When verify is invoked on a CertifiedMintTransaction whose justification uses tag 88888
    Then the result status is FAIL
    And the registry result message contains "Unsupported mint justification tag"

  Scenario: Multiple verifiers can coexist under different tags
    Given a fresh MintJustificationVerifierService is created
    And a SplitMintJustificationVerifier is registered
    And a stub verifier for tag 99999 is registered
    When verify is invoked on a CertifiedMintTransaction whose justification uses tag 99999
    Then the result status is OK
    And the stub verifier was invoked exactly once
