export default {
  paths: ['tests/bdd/functional/features/**/*.feature'],
  requireModule: [],
  import: ['tests/bdd/functional/support/World.ts', 'tests/bdd/functional/steps/**/*.steps.ts'],
  format: ['summary'],
};
