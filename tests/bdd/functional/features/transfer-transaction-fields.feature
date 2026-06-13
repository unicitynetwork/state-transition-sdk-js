Feature: TransferTransaction round-trip preserves stateMask boundaries

  # PR #110 1f24579 — the field formerly known as `nonce` was renamed to `stateMask`.
  # PR #114 #113 — transaction recipient/lockScript are EncodedPredicate on the wire.
  # This feature pins byte-for-byte preservation of stateMask across the CBOR boundary
  # at varying byte lengths, plus the recipient wire-type invariant.

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario Outline: TransferTransaction round-trip preserves stateMask of <length> bytes
    Given a TransferTransaction is built from Alice's token with a stateMask of <length> bytes
    When the TransferTransaction is encoded and decoded
    Then the decoded stateMask is <length> bytes
    And the decoded stateMask byte-for-byte equals the original

    Examples:
      | length |
      | 0      |
      | 1      |
      | 32     |
      | 64     |

  Scenario: TransferTransaction recipient is an EncodedPredicate and round-trips by bytes
    Given a TransferTransaction is built from Alice's token with a stateMask of 32 bytes
    Then the transfer recipient is an EncodedPredicate
    And the transfer lockScript is an EncodedPredicate
    When the TransferTransaction is encoded and decoded
    Then the decoded transfer recipient encodes to the original recipient bytes
