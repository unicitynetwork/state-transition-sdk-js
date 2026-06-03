Feature: TokenSalt mutation safety and randomness — sdk-js#115

  # PR #119 / sdk-js#115 introduced TokenSalt as a 32-byte value type. Two safety
  # properties are load-bearing for tokenId determinism:
  #   - Input bytes passed to fromBytes must be defensively copied (mutation after
  #     construction must not change the stored value).
  #   - Output bytes returned by toBytes must be a copy (mutating the returned slice
  #     must not change the stored value).
  #   - TokenSalt.generate must produce a different value every call (CSPRNG-backed).
  # If any of these regress, two callers can silently end up with the same tokenId or a
  # caller can corrupt a salt mid-flight.
  #
  # All scenarios are hermetic.

  Scenario: TokenSalt.fromBytes defensively copies its input (input mutation does not leak)
    Given a 32-byte input buffer is filled with 0xA1
    And TokenSalt.fromBytes is called on the input buffer
    When the input buffer is mutated to all 0x00 after construction
    Then the TokenSalt still encodes to its original 0xA1 bytes

  Scenario: TokenSalt.toBytes returns a copy (output mutation does not leak)
    Given a 32-byte input buffer is filled with 0xB2
    And TokenSalt.fromBytes is called on the input buffer
    When the bytes returned by toBytes are mutated to all 0x00
    Then the TokenSalt still encodes to its original 0xB2 bytes

  Scenario: Two TokenSalt.generate calls produce different salts
    When TokenSalt.generate is called 100 times
    Then no two of the generated salts are byte-identical
