Feature: SignatureVerificationRule emits a canonical rule-name format — sdk-js#115

  # PR #119 commit e635578 (Martti, 2026-06-04) fixed a typo introduced in 3e3a7fe
  # ("Draft version of sdk 2.0"). UnicitySealQuorumSignaturesVerificationRule.verifySignature
  # has three exit paths — two FAIL emitters at lines 63 and 72 used the correct rule name
  # `SignatureVerificationRule[<nodeId>]`, but the OK emitter at line 78 had a stray trailing
  # `}`:
  #
  #     - return new VerificationResult(`SignatureVerificationRule[${nodeId}]}`, OK);
  #     + return new VerificationResult(`SignatureVerificationRule[${nodeId}]`, OK);
  #
  # That mismatch broke any consumer filtering the result tree by rule name (the pattern
  # PR #119/#116 introduced for MintNetworkMatchesTrustBaseRule etc.) — OK rows for this rule
  # were silently invisible to a filter that asked for the FAIL form.
  #
  # Note on test shape: Token.verify discards UnicityCertificateVerification's result subtree
  # on OK (InclusionProofVerificationRule:117), so the OK rule names don't surface through the
  # public Token.verify path. We invoke UnicitySealQuorumSignaturesVerificationRule.verify
  # directly on a real mint's seal and walk its per-node children.
  #
  # Live (needs a real mint to produce a signed seal).

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario: The quorum rule's per-node OK results all match SignatureVerificationRule[<nodeId>]
    When the quorum-signatures rule is invoked directly on the genesis seal
    Then every per-node child rule name matches the canonical SignatureVerificationRule format
    And no per-node child rule name ends with a trailing right brace
