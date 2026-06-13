@deferred
Feature: Investigated coverage gaps that turned out non-testable or moved — sdk-js#115/#116

  # Originally tracked as deferred. After further investigation:
  #
  # ---------------------------------------------------------------------------
  # #7 — Aggregator rejection of arity-6 MintTransaction over the wire.
  # ---------------------------------------------------------------------------
  # REMOVED — the premise is wrong. The certification_request CBOR built by
  # CertificationData.toCBOR is `[version, lockScript, sourceStateHash, transactionHash,
  # unlockScript]`. It carries the MintTransaction's *transactionHash* (a 32-byte digest),
  # NOT the MintTransaction CBOR bytes. The aggregator never sees the mint's array shape;
  # arity validation lives entirely SDK-side and is already covered by the arity-7 row in
  # cbor-envelope-tags.feature (updated for #119) and by mint-wire-mutation.feature.
  #
  # ---------------------------------------------------------------------------
  # #8 — UnicitySealNetworkMatchesTrustBaseRule isolated FAIL.
  # ---------------------------------------------------------------------------
  # MOVED — now covered by seal-network-rule-isolation.feature (commit on
  # feature/test-infrastructure). That feature CBOR-tampers the unicitySeal's networkId byte
  # inside a real mint's inclusion proof and asserts both:
  #   - MintNetworkMatchesTrustBaseRule = OK (mint genesis still matches trust base)
  #   - UnicitySealNetworkMatchesTrustBaseRule = FAIL (tampered seal differs)
  # confirming the seal rule fires before signature verification per the PR #119 ordering.
  #
  # No remaining deferred scenarios. This file is kept as a paper trail; remove when no longer
  # referenced.

  Scenario: PLACEHOLDER — historical paper trail
    Given the deferred placeholder runs nothing
