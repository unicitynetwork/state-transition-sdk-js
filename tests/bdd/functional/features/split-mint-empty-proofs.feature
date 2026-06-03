@known-bug
Feature: SplitMintJustification.fromCBOR bypasses the empty-proofs invariant — bug repro

  # Adversarial finding from the PR #119 review (B3#1, pre-existing bug, not introduced by #119):
  #
  #   `SplitMintJustification.create(token, proofs)` enforces `proofs.length > 0` at line 36 and
  #   throws "proofs cannot be empty." otherwise. However, `SplitMintJustification.fromCBOR` at
  #   line 58 calls `new SplitMintJustification(...)` directly, bypassing the invariant. A
  #   crafted CBOR payload with zero proofs decodes cleanly.
  #
  # Tagged @known-bug so the regression filter excludes this feature until SplitMintJustification.fromCBOR
  # is routed through create() or the proofs.length>0 check is duplicated on decode.

  Scenario: SplitMintJustification.create rejects empty proofs — hermetic positive control
    When SplitMintJustification.create is called in isolation with a null token and an empty proof list
    Then SplitMintJustification.create throws "proofs cannot be empty"

  Scenario: SplitMintJustification.fromCBOR accepts empty proofs — the bug
    Given a mock aggregator client is set up
    And Alice has split-minted 2 tokens with 2 payment assets
    And an arbitrary single-token SplitMintJustification is encoded to CBOR
    When the CBOR is rewritten with an empty proofs array
    Then SplitMintJustification.fromCBOR should reject the empty-proofs payload
