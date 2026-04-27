Feature: InclusionProof verification status surface
  As a maintainer of the state transition SDK
  I want every status branch in InclusionProofVerificationRule to be reachable from a real proof
  So that protocol drift surfaces with the right error code, not a generic failure

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  # T4-21: Branch Coverage — INCLUSION_CERTIFICATE_MISSING fires when proof has no certificate
  Scenario: Verification of a proof with no inclusionCertificate returns INCLUSION_CERTIFICATE_MISSING
    When the inclusion proof has its inclusionCertificate removed
    Then verification of the modified proof returns "INCLUSION_CERTIFICATE_MISSING"

  # T4-22: Branch Coverage — MISSING_CERTIFICATION_DATA fires when proof has no certData
  Scenario: Verification of a proof with no certificationData returns MISSING_CERTIFICATION_DATA
    When the inclusion proof has its certificationData removed
    Then verification of the modified proof returns "MISSING_CERTIFICATION_DATA"

  # T4-23: Error Guessing — corrupting a sibling drives PATH_INVALID
  Scenario: Verification of a proof with a corrupted sibling hash returns PATH_INVALID
    When the inclusion proof's first sibling hash is corrupted
    Then verification of the modified proof returns "PATH_INVALID"

  # T4-24: Risk-Based — SHARD_ID_MISMATCH (bft-shard mode only — single-aggregator length=0 short-circuits)
  @multi-shard-only
  Scenario: Verification with a non-prefix shardTreeCertificate returns SHARD_ID_MISMATCH
    When the UC's shardTreeCertificate is replaced with a non-matching prefix
    Then verification of the modified proof returns "SHARD_ID_MISMATCH"

  # T4-25: State Transition — when both txhash and a sibling are bad,
  #        the rule that fires earlier (txhash) dictates the status.
  Scenario: Status precedence — txhash failure dominates path-invalid failure
    When the inclusion proof's transactionHash is replaced with garbage
    And the inclusion proof's first sibling hash is corrupted on top
    Then verification of the modified proof returns "TRANSACTION_HASH_MISMATCH"

  # T4-26: Decision Table — single scenario covering the high-level matrix
  Scenario Outline: Mutation "<mutation>" surfaces status "<expectedStatus>"
    When the inclusion proof is mutated by "<mutation>"
    Then verification of the modified proof returns "<expectedStatus>"

    Examples:
      | mutation                        | expectedStatus                  |
      | drop-inclusion-certificate      | INCLUSION_CERTIFICATE_MISSING   |
      | drop-certification-data         | MISSING_CERTIFICATION_DATA      |
      | corrupt-sibling                 | PATH_INVALID                    |
      | corrupt-txhash                  | TRANSACTION_HASH_MISMATCH       |
