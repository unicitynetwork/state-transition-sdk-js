Feature: TokenId is derived from (networkId, salt) — sdk-js#115

  # PR #119 / issue #115: tokenId = SHA-256(CBOR(salt, networkId)). Caller-supplied tokenIds
  # are no longer serialized; MintTransaction now carries a networkId and a 32-byte salt, and
  # tokenId is derived deterministically from both via TokenId.fromSalt. NetworkId rejects 0
  # (and any value outside the 16-bit unsigned range) in safe builders, and resolves the
  # registered singletons (MAINNET=1, TESTNET=2, LOCAL=3) for known ids.
  #
  # All scenarios in this feature are offline (no aggregator needed) — they document and pin
  # the derivation surface and round-trip stability.

  Scenario Outline: NetworkId.fromId(<id>) is rejected as out-of-range
    When NetworkId.fromId is called with <id>
    Then NetworkId construction throws "Network identifier out of allowed"

    Examples:
      | id     |
      | 0      |
      | 65536  |
      | -1     |

  Scenario Outline: NetworkId.fromId resolves the registered constants
    When NetworkId.fromId is called with <id>
    Then it resolves to <constant>

    Examples:
      | id | constant |
      | 1  | MAINNET  |
      | 2  | TESTNET  |
      | 3  | LOCAL    |

  Scenario: NetworkId.fromId accepts arbitrary 16-bit ids and reports them
    When NetworkId.fromId is called with 42
    Then the resolved NetworkId has id 42

  Scenario Outline: The same salt on different networks derives different tokenIds
    When TokenId.fromSalt is computed for the fixed salt and networkId <network1>
    And TokenId.fromSalt is computed for the fixed salt and networkId <network2>
    Then the two derived tokenIds are different

    Examples:
      | network1 | network2 |
      | 1        | 2        |
      | 1        | 3        |
      | 2        | 3        |

  Scenario: The same salt on the same network derives the same tokenId (deterministic)
    When TokenId.fromSalt is computed for the fixed salt and networkId 3
    And TokenId.fromSalt is computed for the fixed salt and networkId 3
    Then the two derived tokenIds are equal

  Scenario: TokenSalt rejects a non-32-byte input
    When TokenSalt.fromBytes is called with a 31-byte input
    Then TokenSalt construction throws "32 bytes long"

  Scenario: TokenSalt.generate produces a 32-byte salt
    When TokenSalt.generate is invoked
    Then the resulting salt is 32 bytes

  Scenario: MintTransaction CBOR round-trip preserves networkId, salt, and derived tokenId
    Given a MintTransaction is built with networkId 3 and a fixed salt
    When the MintTransaction round-trips through CBOR
    Then the decoded transaction's networkId equals the original
    And the decoded transaction's salt encodes to the original salt bytes
    And the decoded transaction's tokenId equals the original tokenId

  Scenario: MintTransaction.tokenId equals an independent TokenId.fromSalt derivation of its fields
    Given a MintTransaction is built with networkId 3 and a fixed salt
    Then the mint's tokenId equals an independent TokenId.fromSalt derivation

  Scenario: MintTransaction.create defaults to a 32-byte random salt when none is provided
    Given a MintTransaction is built without an explicit salt
    Then the mint's salt is 32 bytes
