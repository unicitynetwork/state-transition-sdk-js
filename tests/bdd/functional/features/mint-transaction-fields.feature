Feature: MintTransaction round-trip across (justification, data) cells

  # PR #110 406f890 — MintTransaction grew a `justification` field independent of `data`.
  # This feature pins the four combinations through pure CBOR round-trip.

  Scenario Outline: Round-trip preserves both fields when <case>
    Given a MintTransaction is built with justification "<justification>" and data "<data>"
    When the MintTransaction is encoded and decoded
    Then the decoded justification matches "<justification>"
    And the decoded data matches "<data>"

    Examples:
      | case                       | justification          | data                |
      | both null (genesis mint)   | null                   | null                |
      | data only (memo mint)      | null                   | deadbeef            |
      | both non-null (split mint) | aabbccddeeff           | 1122334455          |
      | justification only         | aabbccddeeff           | null                |
