import { Given } from '@cucumber/cucumber';

// Placeholder step backing the @deferred scenarios in deferred-coverage.feature. These
// scenarios document intent and require fixture work (RawCertificationSubmitter extension
// for #7, InclusionProof CBOR tampering for #8). The standard regression filter excludes
// @deferred, so this step never runs in CI today; it exists so the feature file parses.
Given('the deferred placeholder runs nothing', function (): void {
  // intentionally empty
});
