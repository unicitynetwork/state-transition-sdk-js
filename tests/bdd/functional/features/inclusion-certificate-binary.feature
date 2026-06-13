Feature: InclusionCertificate binary wire format
  As a maintainer of the state transition SDK
  I want decode/encode/verify to behave correctly on malformed binary input
  So that wire-format regressions surface before they reach the verification path

  # T4-11: BVA — bitmap underflow and sibling alignment
  Scenario Outline: InclusionCertificate.decode rejects malformed binary of length <byteLength>
    Given binary bytes of length <byteLength>
    When InclusionCertificate.decode is invoked
    Then InclusionCertificate.decode throws with message containing "<errorFragment>"

    Examples:
      | byteLength | errorFragment |
      | 0          | bitmap        |
      | 31         | bitmap        |
      | 33         | misaligned    |
      | 63         | misaligned    |
      | 65         | misaligned    |

  # T4-12: Cause-Effect — popcount must match siblings count
  Scenario: InclusionCertificate.decode rejects when popcount(bitmap) != siblings count
    Given a 64-byte buffer where the bitmap has popcount 2 and only 1 sibling chunk follows
    When InclusionCertificate.decode is invoked
    Then InclusionCertificate.decode throws with message containing "siblings count"

  # T4-13: Checklist-Based — encode then decode is idempotent
  Scenario: InclusionCertificate.encode then decode preserves bitmap and siblings
    Given an InclusionCertificate built from the test fixture token
    When the InclusionCertificate is encoded then decoded
    Then the decoded bitmap equals the original
    And the decoded sibling count equals the original

  # T4-14: Error Guessing — corrupting one sibling byte makes verify fail
  Scenario: InclusionCertificate.verify returns false when a sibling byte is corrupted
    Given an InclusionCertificate built from the test fixture token
    When the first sibling hash is corrupted
    Then verify returns false against the original root and StateID

  # T4-15: Risk-Based — wrong expected root hash makes verify fail
  Scenario: InclusionCertificate.verify returns false when expected root differs
    Given an InclusionCertificate built from the test fixture token
    When verify is called with a root hash differing by one byte
    Then verify returns false
