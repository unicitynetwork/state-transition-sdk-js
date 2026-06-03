@deferred
Feature: Deferred coverage tracked against future fixture surgery — sdk-js#115/#116

  # These scenarios document gaps from the post-#119 coverage audit that need either an
  # aggregator integration seam (#7) or CBOR-level inclusion-proof tampering (#8). They are
  # tagged @deferred so the standard regression filter skips them. Bringing each into the
  # green path is a follow-up task — the scenarios below preserve intent so a future author
  # has a concrete spec to work against.

  # ---------------------------------------------------------------------------
  # #7 — Aggregator rejects an arity-6 MintTransaction sent over the wire.
  # ---------------------------------------------------------------------------
  # PR #119 bumped MintTransaction CBOR arity from 6 to 7. Existing
  # canonical-certification-request.feature (tagged @canonical-cbor) tests the aggregator's
  # ValidateCoreDeterministic gate via the raw JSON-RPC seam in RawCertificationSubmitter.
  # To cover this case the seam needs to be extended to submit a hand-crafted
  # certification_request that embeds an arity-6 MintTransaction. Expected behavior: the
  # aggregator rejects with a semantic-validation error (NOT the "CBOR is not canonical"
  # prefix — this is structurally wrong, not canonically wrong).
  #
  # Follow-up: extend RawCertificationSubmitter with `buildLegacyAritySixMintCbor()` and a
  # matching When/Then pair. Tag the new scenario @canonical-cbor so it runs under the same
  # aggregator-required gate.

  Scenario: PLACEHOLDER — arity-6 MintTransaction is rejected by the aggregator
    Given the deferred placeholder runs nothing

  # ---------------------------------------------------------------------------
  # #8 — UnicitySealNetworkMatchesTrustBaseRule isolated FAIL.
  # ---------------------------------------------------------------------------
  # When verifying a token under a wrong-network trust base, MintNetworkMatchesTrustBaseRule
  # fires first (CertifiedMintTransactionVerificationRule:33) and short-circuits the rest of
  # the verification. To observe UnicitySealNetworkMatchesTrustBaseRule (in
  # UnicityCertificateVerification:54) FAIL in isolation, the test needs a CertifiedMintTransaction
  # where:
  #   - genesis.networkId == trustBase.networkId  (so the mint rule passes)
  #   - inclusionProof.unicityCertificate.unicitySeal.networkId != trustBase.networkId
  #
  # The aggregator never emits this naturally. To construct it the test must surgically
  # rewrite the unicityCertificate CBOR inside the inclusion proof, swapping the seal's
  # networkId byte. The seal's signature won't re-verify after that, but the network rule
  # fires BEFORE signature checks per PR #119, so the test can still observe seal-rule FAIL
  # before SignatureVerificationRule[*] would have failed.
  #
  # Follow-up: add CBOR-level tampering for InclusionProof similar to mint-wire-mutation.steps.ts,
  # then a scenario that asserts the result tree contains UnicitySealNetworkMatchesTrustBaseRule
  # with status FAIL and that MintNetworkMatchesTrustBaseRule shows OK.

  Scenario: PLACEHOLDER — seal-rule FAIL isolated from mint-rule FAIL
    Given the deferred placeholder runs nothing
