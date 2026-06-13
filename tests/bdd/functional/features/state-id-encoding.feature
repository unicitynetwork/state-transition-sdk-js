Feature: StateID encoding — 32-byte enforcement
  As a maintainer of the state transition SDK
  I want StateId.fromCBOR to reject any non-32-byte payload
  So that legacy v1 (34-byte algorithm-prefixed) StateIDs cannot leak into the v2 wire format

  # T4-27: BVA — only 32 bytes is accepted; surrounding lengths fail
  Scenario Outline: StateId.fromCBOR with a <length>-byte payload <verb>
    Given a CBOR byte string of length <length>
    When StateId.fromCBOR is invoked
    Then the StateId decode <result>

    Examples:
      | length | verb   | result                                          |
      | 0      | fails  | throws with message containing "data length"    |
      | 31     | fails  | throws with message containing "data length"    |
      | 32     | passes | succeeds                                        |
      | 33     | fails  | throws with message containing "data length"    |
      | 34     | fails  | throws with message containing "data length"    |

  # T4-28: Error Guessing — legacy v1 algorithm-prefixed StateID (34 bytes) is rejected
  Scenario: StateId.fromCBOR rejects the legacy 34-byte algorithm-prefixed form
    Given a CBOR byte string of length 34 starting with the sha256 algorithm prefix
    When StateId.fromCBOR is invoked
    Then the StateId decode throws with message containing "data length"
