Feature: UnicitySealNetworkMatchesTrustBaseRule isolated FAIL — sdk-js#116

  # PR #119 introduced two separate network-id rules:
  #   - MintNetworkMatchesTrustBaseRule (genesis.networkId vs trustBase.networkId)
  #   - UnicitySealNetworkMatchesTrustBaseRule (seal.networkId vs trustBase.networkId)
  #
  # The existing network-id-consistency.feature swaps the trust-base's networkId and observes
  # MintNetworkMatchesTrustBaseRule FAIL (both rules see the same trust-base mismatch, and the
  # mint rule fires first). To isolate the seal rule we need:
  #   - genesis.networkId == trustBase.networkId  (mint rule passes)
  #   - inclusionProof.unicityCertificate.unicitySeal.networkId != trustBase.networkId  (seal rule fails)
  #
  # We construct that shape by CBOR-level tampering of the seal's networkId byte inside a real
  # mint's inclusion proof. The signature over the seal will no longer verify after the swap,
  # but the seal rule fires BEFORE signature verification per the PR #119 ordering — so the test
  # observes the seal rule's FAIL specifically, not a signature failure.
  #
  # Live (uses real aggregator).

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario: Tampering the seal's networkId surfaces UnicitySealNetworkMatchesTrustBaseRule FAIL
    When the genesis inclusion proof's unicitySeal networkId is swapped to a different network
    And the tampered cert mint is verified under the native trust base
    Then the network-consistency verification status is FAIL
    And the verification result contains a "MintNetworkMatchesTrustBaseRule" rule with status "OK"
    And the verification result contains a "UnicitySealNetworkMatchesTrustBaseRule" rule with status "FAIL"
