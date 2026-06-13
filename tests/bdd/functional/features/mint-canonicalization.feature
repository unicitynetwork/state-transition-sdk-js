Feature: MintTransaction canonical CBOR — byte-stability and two-build determinism

  # PR #119 / sdk-js#115 — MintTransaction wire shape changed (arity 7 with networkId + salt
  # replacing caller-supplied tokenId). The stateId/CertificationData chain depends on the
  # CBOR being byte-stable across encode→decode→re-encode AND deterministic across two
  # independent builds with the same logical inputs. Without both, two SDK callers minting
  # the same logical token would compute different stateIds.
  #
  # This feature pins both properties end-to-end via the public MintTransaction surface.
  # All scenarios are hermetic (no aggregator).

  Scenario: Encode → decode → re-encode yields byte-identical CBOR (canonicalization)
    Given a MintTransaction is built with networkId 3, a fixed salt, and a fixed tokenType
    When the MintTransaction is re-encoded after decoding
    Then the re-encoded CBOR bytes are byte-identical to the original

  Scenario: Two independent builds with identical logical inputs produce byte-identical CBOR
    Given two MintTransactions are built independently with the same networkId 3, salt, recipient, and tokenType
    Then both MintTransactions encode to byte-identical CBOR
    And both MintTransactions derive the same tokenId

  Scenario Outline: Re-encode stability holds across the (justification, data) matrix
    Given a MintTransaction is built with networkId 3, fixed salt, justification "<justification>" and data "<data>"
    When the MintTransaction is re-encoded after decoding
    Then the re-encoded CBOR bytes are byte-identical to the original

    Examples:
      | justification | data       |
      | null          | null       |
      | null          | deadbeef   |
      | aabbcc        | null       |
      | aabbcc        | 1122334455 |
