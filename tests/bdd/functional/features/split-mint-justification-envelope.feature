Feature: SplitMintJustification CBOR envelope and invariants

  Background:
    Given a mock aggregator client is set up
    And Alice has split-minted 2 tokens with 2 payment assets

  # PR #110 406f890 — SplitMintJustification carries the burned token plus per-asset proofs
  # in a sibling field of MintTransaction. This feature pins its envelope shape and the
  # only constructor invariant: proofs cannot be empty.

  Scenario: Round-trip preserves the underlying token and proofs byte-for-byte
    Given the SplitMintJustification of one of Alice's split tokens
    When the justification is encoded and decoded back
    Then the decoded token's CBOR equals the original token's CBOR
    And the decoded proofs equal the original proofs

  Scenario: SplitMintJustification.create rejects empty proof list
    When SplitMintJustification.create is called with an empty proof list
    Then an error is thrown with message containing "proofs cannot be empty"

  Scenario: Correctly-tagged 2-element payload decodes (positive shape, no version slot)
    Given the SplitMintJustification of one of Alice's split tokens
    When the justification bytes are decoded via SplitMintJustification.fromCBOR
    Then no decoding error is raised
