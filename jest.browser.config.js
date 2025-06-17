export default {
  preset: 'jest-puppeteer',
  testMatch: ['<rootDir>/tests/browser/**/*.test.ts'],
  testEnvironment: 'jest-environment-puppeteer',
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(puppeteer|jest-puppeteer)/)'
  ]
};