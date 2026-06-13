Feature: Token Verification - Wrong Trust Base
  As a user of the state transition SDK
  I want tokens to fail verification against an incorrect trust base
  So that the trust model is enforced

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  # T2-02: wrong-trust-base (Error Guessing + Risk-Based)
  Scenario: Token verified against wrong trust base fails
    Then the token fails verification against a different trust base
