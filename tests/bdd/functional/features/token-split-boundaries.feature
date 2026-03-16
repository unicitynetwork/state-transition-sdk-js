Feature: Token Split - Value Boundary Validation
  As a user of the state transition SDK
  I want split operations to validate asset values correctly
  So that token value integrity is maintained

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token with 2 payment assets worth 100 and 200

  # T1-07: split-value-boundaries — overflow (BVA)
  Scenario: Split where total exceeds original value fails
    When Alice tries to split with values exceeding the original totals
    Then the split fails with TokenAssetValueMismatchError

  # T1-07: split-value-boundaries — underflow (BVA)
  Scenario: Split where total is less than original value fails
    When Alice tries to split with values less than the original totals
    Then the split fails with TokenAssetValueMismatchError

  # T1-07: split-value-boundaries — minimum (BVA + Equivalence Partitioning)
  Scenario: Split with minimum asset value of 1 is accepted
    When Alice tries to split with minimum values of 1 and the remainder
    Then the split validation succeeds
