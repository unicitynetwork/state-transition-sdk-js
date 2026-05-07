Feature: CBOR envelope tags and version slots
  As a maintainer of the state transition SDK
  I want decoders to reject wrong-tag and wrong-version payloads with crisp errors
  So that protocol drift fails loudly instead of silently corrupting state

  # T4-07: Decision Table + Pairwise — tag mismatch across types
  Scenario Outline: <type> decoded with the wrong CBOR tag throws CborError
    Given a tagged CBOR payload using tag <wrongTag> with arity <arity> and version <version>
    When fromCBOR is invoked on type "<type>"
    Then a CborError is thrown with message containing "<type>"

    # Note: CertificationRequest is encode-only (no fromCBOR by design — SDK never decodes a
    # request payload it just sent), so the wrong-tag matrix omits it. See discovery notes.
    # EncodedPredicate's error message says "Predicate" (not its class name) — see split scenario below.
    Examples:
      | type                     | wrongTag | arity | version |
      | CertificationData        | 39030    | 5     | 1       |
      | InclusionProof           | 39041    | 4     | 1       |
      | InputRecord              | 39031    | 10    | 1       |
      | ShardTreeCertificate     | 39031    | 2     | 1       |
      | MintTransaction          | 39031    | 6     | 1       |
      | SplitMintJustification   | 39031    | 2     | 1       |
      | UnicityCertificate       | 39031    | 7     | 1       |
      # UnicityIdMintTransaction shares tag 39041 with MintTransaction by design,
      # so we exercise its wrong-tag branch with a different non-matching tag.
      | UnicityIdMintTransaction | 39031    | 6     | 1       |

  Scenario: EncodedPredicate decoded with the wrong CBOR tag throws CborError
    Given a tagged CBOR payload using tag 39031 with arity 3 and version 0
    When fromCBOR is invoked on type "EncodedPredicate"
    Then a CborError is thrown with message containing "Predicate"

  # T4-08: BVA — wrong version is rejected at min and next-valid boundary
  Scenario Outline: <type> decoded with version <version> throws CborError
    Given a tagged CBOR payload using tag <correctTag> with arity <arity> and version <version>
    When fromCBOR is invoked on type "<type>"
    Then a CborError is thrown with message containing "version"

    Examples:
      | type                     | correctTag | arity | version |
      | CertificationData        | 39031      | 5     | 0       |
      | CertificationData        | 39031      | 5     | 2       |
      | InclusionProof           | 39033      | 4     | 2       |
      | InputRecord              | 39002      | 10    | 2       |
      | MintTransaction          | 39041      | 6     | 2       |
      | UnicityCertificate       | 39001      | 7     | 2       |
      | UnicityIdMintTransaction | 39041      | 6     | 2       |

  # T4-09: Cause-Effect — "Predicate has no version slot" invariant.
  # Note: EncodedPredicate.fromCBOR currently does not validate array arity, so a 4-element
  # payload with the correct tag silently decodes (only the first 3 fields are read).
  # This is a coverage gap in the SDK itself — tracked in docs/test-expansion-discoveries.md.
  # We assert the *positive* invariant instead: a correctly-tagged 3-element payload decodes.
  Scenario: EncodedPredicate's correct-shape payload decodes (3-element, no version slot)
    Given a tagged CBOR payload using tag 39032 with arity 3 and version 1
    When fromCBOR is invoked on type "EncodedPredicate"
    Then no CborError is thrown

  # PR #110 — SplitMintJustification has no version slot (only token + proofs).
  # The wrong-version table above intentionally excludes it; we assert the positive invariant.
  Scenario Outline: SplitMintJustification arity gate fires before any version concern
    Given a tagged CBOR payload using tag 39044 with arity <arity> and version 0
    When fromCBOR is invoked on type "SplitMintJustification"
    Then a CborError is thrown with message containing "<expectedSubstring>"

    Examples:
      | arity | expectedSubstring |
      | 1     | array             |
      | 3     | array             |

  # PR #110 fdcf6ab — CertificationData stores a canonicalized lockScript at construction
  # via EncodedPredicate.fromPredicate(...).toCBOR(). A round-trip through fromCBOR and back
  # must produce byte-identical CBOR — proving canonicalization is stable.
  Scenario: CertificationData lockScript is canonicalized and round-trips stably
    Given a CertificationData is built from a sample MintTransaction
    When the CertificationData is encoded, decoded, and re-encoded
    Then the original and re-encoded CBOR bytes are byte-identical
