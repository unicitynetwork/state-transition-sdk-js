@canonical-cbor
Feature: Aggregator rejects non-canonical certification_request CBOR

  # aggregator-go#153: ValidateCoreDeterministic runs before processing and rejects any
  # certification_request whose CBOR is not RFC 8949 Core Deterministic, with an error whose
  # message starts with "CBOR is not canonical: <reason>". The SDK always emits canonical CBOR,
  # so these scenarios bypass the typed client and POST hand-mutated bytes via a raw JSON-RPC
  # seam (RawCertificationSubmitter), starting from a real canonical request and mutating it.
  #
  # Gated behind @canonical-cbor — needs a PR #153 aggregator (run via the proxy / AGGREGATOR_URL).
  # The reason substrings are aggregator-go#153's wording; if a build changes them, only the
  # Examples table needs editing — the "CBOR is not canonical" prefix is the stable contract.
  #
  # Breadth: these mutations are envelope-level (tag / array header / version / length / final
  # element), exercising the validator's top-level scan end-to-end. Non-canonical forms buried
  # deep inside stateId/certData are covered by aggregator-go's own Go unit tests; this feature
  # is the e2e smoke that proves the control fires through the gateway.

  Background:
    Given a mock aggregator client is set up
    And a fresh canonical certification_request is built

  # Positive control — proves the raw seam itself is sound, so rejections below are due to the
  # mutation and not the transport.
  Scenario: The unmutated canonical request is accepted
    When the canonical certification_request is submitted raw
    Then the raw submission is accepted

  Scenario Outline: A "<case>" certification_request is rejected as non-canonical
    When the certification_request is mutated to "<case>" and submitted raw
    Then the raw submission is rejected as non-canonical because of "<reason>"
    And the mutated request is not certified

    Examples:
      | case                | reason                                        |
      | unsorted map keys   | map keys not in core deterministic order      |
      | non-minimal integer | non-shortest argument encoding                |
      | non-minimal length  | non-shortest argument encoding                |
      | indefinite-length   | indefinite or reserved additional information |
      | trailing bytes      | trailing data                                 |
      | float               | floating point values are not supported       |
