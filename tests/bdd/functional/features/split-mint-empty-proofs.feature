Feature: SplitMintJustification rejects empty proofs at both create() and fromCBOR — sdk-js#115

  # SplitMintJustification.create enforces `proofs.length > 0` (line 36-38) and throws
  # "proofs cannot be empty." otherwise.
  #
  # PR #119 commit 1dbc4a0 (Martti, 2026-06-04) closed a gap surfaced by this session's
  # adversarial review: SplitMintJustification.fromCBOR previously called
  # `new SplitMintJustification(...)` directly at line 58, bypassing the create() invariant
  # so a crafted CBOR with zero proofs decoded cleanly. The fix routes fromCBOR through
  # create():
  #
  #     - return new SplitMintJustification(
  #     + return SplitMintJustification.create(
  #         await Token.fromCBOR(data[0]),
  #         CborDeserializer.decodeArray(data[1]).map(p => SplitAssetProof.fromCBOR(p)),
  #       );
  #
  # These scenarios pin BOTH enforcement paths so a future refactor can't silently
  # re-introduce the bypass.

  Scenario: SplitMintJustification.create rejects empty proofs — hermetic positive control
    When SplitMintJustification.create is called in isolation with a null token and an empty proof list
    Then SplitMintJustification.create throws "proofs cannot be empty"

  Scenario: SplitMintJustification.fromCBOR rejects empty proofs — regression guard for 1dbc4a0
    Given a mock aggregator client is set up
    And Alice has split-minted 2 tokens with 2 payment assets
    And an arbitrary single-token SplitMintJustification is encoded to CBOR
    When the CBOR is rewritten with an empty proofs array
    Then SplitMintJustification.fromCBOR rejects with "proofs cannot be empty"
