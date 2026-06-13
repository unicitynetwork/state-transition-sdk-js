import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { TokenWorld } from '../support/World.js';

// Canonical rule-name shape for the per-node seal signature check. PR #119 commit e635578
// fixed a stray `}` in the OK branch — the regex pins both that there is no trailing brace
// and that the bracketed nodeId is non-empty.
const CANONICAL_SIGNATURE_RULE_NAME = /^SignatureVerificationRule\[[^\]]+]$/;

interface ISignatureRuleStash {
  result?: VerificationResult<unknown>;
}

function getStash(world: TokenWorld): ISignatureRuleStash {
  world.signatureRuleStash ??= {};
  return world.signatureRuleStash;
}

When(
  'the quorum-signatures rule is invoked directly on the genesis seal',
  async function (this: TokenWorld): Promise<void> {
    const seal = this.token.genesis.inclusionProof.unicityCertificate.unicitySeal;
    getStash(this).result = await UnicitySealQuorumSignaturesVerificationRule.verify(this.setup.trustBase, seal);
  },
);

Then(
  'every per-node child rule name matches the canonical SignatureVerificationRule format',
  function (this: TokenWorld): void {
    const stash = getStash(this);
    assert.ok(stash.result, 'quorum-signatures rule was not invoked — When step skipped?');
    const children = stash.result.results;
    assert.ok(children.length > 0, 'expected at least one per-node child result');
    for (const child of children) {
      assert.match(
        child.rule,
        CANONICAL_SIGNATURE_RULE_NAME,
        `rule name "${child.rule}" does not match canonical SignatureVerificationRule[<nodeId>] format ` +
          `(commit e635578 removed a stray trailing "}" from the OK branch)`,
      );
    }
  },
);

Then('no per-node child rule name ends with a trailing right brace', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.result, 'quorum-signatures rule was not invoked — When step skipped?');
  const offenders = stash.result.results.filter((c) => c.rule.endsWith('}'));
  assert.strictEqual(
    offenders.length,
    0,
    `${offenders.length} per-node rule name(s) end with a stray "}" — regression of commit e635578: ${offenders
      .map((o) => o.rule)
      .join(', ')}`,
  );
});
