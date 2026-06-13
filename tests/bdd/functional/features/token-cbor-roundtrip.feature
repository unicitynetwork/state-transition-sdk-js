Feature: Token CBOR Roundtrip — All States

  Background:
    Given a mock aggregator client is set up

  # T3-04: Checklist-Based — freshly minted token roundtrip
  Scenario: Freshly minted token survives CBOR roundtrip
    Given Alice has a minted token
    When the token is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported token has the same ID as the original
    And the imported token passes verification

  # T3-04: Checklist-Based — transferred token roundtrip
  Scenario: Token after transfer survives CBOR roundtrip
    Given Alice has a minted token
    And Bob is a registered user
    When Alice transfers the token to Bob
    And the transferred token is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported token passes verification
    And the imported token has 1 transaction in its history

  # T3-04: Checklist-Based — split child token roundtrip
  Scenario: Split child token survives CBOR roundtrip
    Given Alice has a minted token with 2 payment assets worth 100 and 200
    When Alice splits the token into 2 new tokens
    And the first split token is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported token passes verification

  # T4-32: Checklist-Based — InclusionProof CBOR is byte-equal idempotent
  Scenario: InclusionProof re-encoding produces byte-identical CBOR
    Given Alice has a minted token
    When the token's inclusion proof is encoded then decoded then re-encoded
    Then the second encoding equals the first byte-for-byte

  # T4-33: Checklist-Based — CertificationData CBOR is byte-equal idempotent
  Scenario: CertificationData re-encoding produces byte-identical CBOR
    Given Alice has a minted token
    When the token's certification data is encoded then decoded then re-encoded
    Then the second encoding equals the first byte-for-byte
