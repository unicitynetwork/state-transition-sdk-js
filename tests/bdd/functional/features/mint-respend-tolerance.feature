Feature: Mint-side re-spend rejection tolerance — sdk-js#118 + sdk-js#119

  # Background: aggregator-go#151 removed the pre-flight `STATE_ID_EXISTS` guard for re-spends.
  # PR #119 then dropped the matching CertificationStatus enum on the SDK side. Re-spends are
  # caught EITHER at submit (the aggregator surfaces a JSON-RPC error → CertificationResponse
  # parsing throws "Invalid JSON structure") OR at proof time as TRANSACTION_HASH_MISMATCH.
  #
  # Existing tolerance scenarios in tree-owner-actions / transfer-edge-cases cover the TRANSFER
  # re-spend case. After #115's tokenId = SHA-256(CBOR(salt, networkId)) change, a MINT re-spend
  # has the same shape: two MintTransaction builds with identical (recipient, salt, tokenType)
  # derive identical tokenId → identical stateId → the second submit is the conflict.
  #
  # This feature covers the MINT side of the tolerance. Live-only (uses real aggregator).
  #
  # Note on shape: re-submitting the SAME mint bytes is idempotent (aggregator returns the
  # cached proof). To trigger a real conflict we hold (salt, networkId, recipient, tokenType)
  # constant — which pins tokenId and therefore stateId — and vary only the `data` field. The
  # second submission collides at the same stateId with a different transactionHash.

  Background:
    Given a mock aggregator client is set up
    And Alice mints and certifies a token with a fixed salt and empty data

  Scenario: A second mint at the same stateId with different data is rejected as a double-spend
    When Alice tries to submit a second mint at the same stateId but with different data
    Then the re-mint is rejected as a double-spend
