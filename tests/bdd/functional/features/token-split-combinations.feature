Feature: Token Split - Combinatorial Asset Configurations
  As a user of the state transition SDK
  I want splits with varying asset counts and target counts to work
  So that the split system is robust across configurations

  Background:
    Given a mock aggregator client is set up

  # T2-04: multi-asset-split-combos (Pairwise/Combinatorial)
  Scenario Outline: Split token with <assetCount> assets into <splitCount> parts
    Given Alice has a minted token containing <assetCount> payment assets
    When Alice splits the token into <splitCount> equal parts
    Then the split validation succeeds

    Examples:
      | assetCount | splitCount |
      | 1          | 2          |
      | 2          | 3          |
      | 3          | 2          |
      | 3          | 3          |
