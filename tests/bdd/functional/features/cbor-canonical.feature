Feature: Canonical CBOR enforcement on decode

  # PR #114 / issue #113 tightened the CBOR reader to reject non-canonical input:
  # non-minimal integer encodings, out-of-order map keys, duplicate keys, indefinite-length
  # encodings, reserved additional-information values, and trailing bytes after a parsed item.
  # Exhaustive byte-level coverage lives in tests/unit/serialization/cbor/CborDeserializerTest.ts;
  # this feature documents the contract at the BDD layer and pins the error-message surface.

  Scenario Outline: <case> is rejected with "<expectedSubstring>"
    Given a hand-crafted CBOR payload "<hex>"
    When it is decoded as a <decoder>
    Then a CborError is thrown with message containing "<expectedSubstring>"

    Examples:
      | case                                  | hex                                                                        | decoder        | expectedSubstring                       |
      | non-minimal 1-byte integer (23 in 2)  | 1817                                                                       | unsigned-int   | not canonical for value 23              |
      | non-minimal 2-byte integer (255 in 3) | 1900FF                                                                     | unsigned-int   | not canonical for value 255             |
      | trailing byte after integer           | 00F6                                                                       | unsigned-int   | Expected end of data                    |
      | trailing byte after array             | 80F6                                                                       | array          | Expected end of data                    |
      | indefinite-length array               | 9FFF                                                                       | array          | Indefinite-length encoding not allowed  |
      | indefinite-length map                 | BFFF                                                                       | map            | Indefinite-length encoding not allowed  |
      | reserved additional-information (30)  | 9E                                                                         | array          | Reserved additional information 30      |
      | duplicate map key                     | A263616263F663616263F6                                                     | map            | Duplicate map key found                 |
      | out-of-order map keys                 | a263616263f6581e000000000000000000000000000000000000000000000000000000000000f5 | map        | not in canonical order                  |

  Scenario: A canonical integer at the byte-length boundary decodes
    Given a hand-crafted CBOR payload "1818"
    When it is decoded as a unsigned-int
    Then no CborError is thrown
