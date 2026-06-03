Feature: MintTransaction wire-slot pinning with asymmetric inputs — sdk-js#115

  # PR #119's MintTransaction wire format is arity 7:
  #   [version, networkId, recipient, salt, tokenType, justification, data]
  # The constructor-arg order is DIFFERENT:
  #   create(networkId, recipient, data, tokenType, salt, justification)
  # Slot indices are remapped inside fromCBOR (data[3]=salt, data[4]=tokenType,
  # data[5]=justification, data[6]=data). A refactor that "aligns" constructor with wire could
  # silently swap two fields — round-trip tests with symmetric inputs (e.g. all-zero salt and
  # all-zero tokenType) would not notice. This feature uses pairwise-distinguishable bytes per
  # field so any slot swap is observable.
  #
  # All scenarios are hermetic.

  Background:
    Given a MintTransaction is built with asymmetric per-field inputs

  Scenario: After round-trip, networkId is the value placed in slot 1
    When the MintTransaction round-trips through CBOR for slot-pinning
    Then the decoded networkId has id 7

  Scenario: After round-trip, recipient bytes match the original predicate slot 2
    When the MintTransaction round-trips through CBOR for slot-pinning
    Then the decoded recipient encodes to the same bytes as the original recipient

  Scenario: After round-trip, salt bytes are all 0xAA from slot 3
    When the MintTransaction round-trips through CBOR for slot-pinning
    Then the decoded salt encodes to 32 bytes of 0xAA

  Scenario: After round-trip, tokenType bytes are all 0xBB from slot 4
    When the MintTransaction round-trips through CBOR for slot-pinning
    Then the decoded tokenType encodes to 32 bytes of 0xBB

  Scenario: After round-trip, justification is 0xCC from slot 5
    When the MintTransaction round-trips through CBOR for slot-pinning
    Then the decoded justification is exactly "cc"

  Scenario: After round-trip, data is 0xDD from slot 6
    When the MintTransaction round-trips through CBOR for slot-pinning
    Then the decoded data is exactly "dd"
