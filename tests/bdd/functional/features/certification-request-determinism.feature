Feature: certification_request id determinism

  # Malleability guard (the rationale behind aggregator-go#153): the requestId/stateId is
  # derived from the request bytes, so the same logical request must always serialize to the
  # same canonical CBOR and map to the same stateId. If a different encoding of the same logical
  # request were accepted it would yield a different id → replay/duplicate-leaf risk.
  # (Re-encode/round-trip stability is covered in token-cbor-roundtrip.feature; this asserts that
  # two independently-built identical requests agree.) Offline — no aggregator needed.

  Scenario: The same logical mint request yields identical bytes and the same stateId
    When the same logical mint certification_request is built twice
    Then the two certification_request encodings are byte-identical
    And the two stateIds are equal
