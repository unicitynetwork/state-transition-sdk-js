Feature: UnicityIdMintTransaction CBOR envelope and round-trip

  # PR #110 805e296 — UnicityIdMintTransaction's serialization was rewritten:
  # CBOR_TAG envelope is now enforced, version is checked, and arity is asserted at 6.
  # Wrong-tag and wrong-version cases are covered by the cbor-envelope-tags.feature outlines.
  # This feature pins the positive round-trip and the field shape.

  Scenario: UnicityIdMintTransaction round-trip preserves all fields
    Given a UnicityIdMintTransaction is built with a sample lockScript, recipient, unicityId, tokenType, and targetPredicate
    When the UnicityIdMintTransaction is encoded and decoded
    Then the decoded transaction's tokenId equals the original
    And the decoded transaction's tokenType equals the original
    And the decoded transaction's lockScript encodes to the original lockScript bytes
    And the decoded transaction's recipient encodes to the original recipient bytes
    And the decoded transaction's targetPredicate encodes to the original targetPredicate bytes
    And the decoded transaction's unicityId encodes to the original unicityId bytes

  # PR #114 #113 — lockScript/recipient are EncodedPredicate on this transaction too;
  # targetPredicate deliberately stays a SignaturePredicate (it is signed against, not just carried).
  Scenario: UnicityIdMintTransaction lockScript and recipient are EncodedPredicate; targetPredicate is not
    Given a UnicityIdMintTransaction is built with a sample lockScript, recipient, unicityId, tokenType, and targetPredicate
    Then the unicity-id lockScript is an EncodedPredicate
    And the unicity-id recipient is an EncodedPredicate
    And the unicity-id targetPredicate is a SignaturePredicate, not an EncodedPredicate
