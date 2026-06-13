Feature: MintTransaction round-trip across (justification, data) cells

  # PR #110 406f890 — MintTransaction grew a `justification` field independent of `data`.
  # PR #114 #113 — transaction recipient/lockScript are now EncodedPredicate on the wire.
  # This feature pins the field combinations through pure CBOR round-trip plus the wire-type
  # and p2sig-lockScript-default invariants.

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

  Scenario: MintTransaction recipient is an EncodedPredicate and round-trips by bytes
    Given a MintTransaction is built with justification "null" and data "null"
    Then the recipient is an EncodedPredicate
    And the lockScript is an EncodedPredicate
    When the MintTransaction is encoded and decoded
    Then the decoded recipient encodes to the original recipient bytes
