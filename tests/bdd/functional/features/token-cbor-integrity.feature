Feature: Token CBOR Import Integrity
  As a user of the state transition SDK
  I want corrupted CBOR data to be rejected during import
  So that only valid tokens are loaded

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  # T1-04: corrupted-cbor-import — truncation (Error Guessing + Risk-Based)
  Scenario: Importing truncated CBOR data fails
    When the token is exported to CBOR
    And the CBOR data is truncated to half its length
    Then importing the corrupted CBOR data fails with an error

  # T1-04: corrupted-cbor-import — random bytes (Error Guessing + Risk-Based)
  Scenario: Importing random bytes as a token fails
    When random bytes are used as token CBOR data
    Then importing the corrupted CBOR data fails with an error
