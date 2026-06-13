Feature: MintTransaction adversarial on-wire field mutations — sdk-js#115

  # PR #119 added two on-wire slots to MintTransaction: networkId (slot 1) and salt (slot 3),
  # both validated on decode. This feature mutates a real CBOR-encoded MintTransaction at the
  # byte level and asserts the decoder rejects each tampered shape. Pins:
  #   - NetworkId.fromId out-of-range guards fire from the decoder side too
  #   - TokenSalt length guards fire from the decoder side too
  #
  # All scenarios are hermetic.

  Background:
    Given a baseline MintTransaction is encoded with networkId 3 and a fixed 32-byte salt

  Scenario: Re-encoding with networkId 0 in the array slot is rejected on decode
    When the baseline CBOR is re-built with networkId replaced by 0
    Then decoding the tampered CBOR throws "Network identifier out of allowed"

  Scenario: Re-encoding with networkId 65536 in the array slot is rejected on decode
    When the baseline CBOR is re-built with networkId replaced by 65536
    Then decoding the tampered CBOR throws "Network identifier out of allowed"

  Scenario: Re-encoding with a 31-byte salt is rejected on decode
    When the baseline CBOR is re-built with the salt slot replaced by 31 random bytes
    Then decoding the tampered CBOR throws "32 bytes long"

  Scenario: Re-encoding with a 33-byte salt is rejected on decode
    When the baseline CBOR is re-built with the salt slot replaced by 33 random bytes
    Then decoding the tampered CBOR throws "32 bytes long"
