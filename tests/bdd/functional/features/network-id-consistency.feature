Feature: Network-id consistency in verification — sdk-js#116

  # PR #119 / issue #116: token / inclusion-proof verification rejects mismatched network ids
  # BEFORE signature/quorum checks. Two rules guard the network boundary:
  #   - MintNetworkMatchesTrustBaseRule (genesis.networkId == trustBase.networkId)
  #   - UnicitySealNetworkMatchesTrustBaseRule
  #     (inclusionProof.unicityCertificate.unicitySeal.networkId == trustBase.networkId)
  # Both fire FIRST in their respective verifiers (CertifiedMintTransactionVerificationRule and
  # UnicityCertificateVerification), so a network-mismatch failure is observable end-to-end with
  # a precise rule name in the verification result tree.
  #
  # Setup: Alice mints a real token against the live aggregator (networkId from the trust-base
  # at TRUST_BASE_PATH). The negative scenarios construct a wrong-network trust base by reading
  # the same JSON and swapping its networkId, then attempt to verify the real token under it.

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  # Positive control — proves the negative scenarios below FAIL specifically for the network
  # rule, not because verification is universally broken under any synthesized trust base.
  Scenario: The token verifies OK under its native trust base
    When the token is verified under its native trust base
    Then the network-consistency verification status is OK

  Scenario: The token is rejected under a trust base whose networkId differs from the mint's
    When the token is verified under a trust base whose networkId is changed to 2
    Then the network-consistency verification status is FAIL
    And the verification result contains a "MintNetworkMatchesTrustBaseRule" rule with status "FAIL"

  Scenario: A transferred token is also rejected under a different-networkId trust base
    Given Bob is a registered user
    When Alice transfers the token to Bob
    And the transferred token is verified under a trust base whose networkId is changed to 2
    Then the network-consistency verification status is FAIL
    And the verification result contains a "MintNetworkMatchesTrustBaseRule" rule with status "FAIL"
