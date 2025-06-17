export default {
  preset: 'jest-puppeteer',
  testMatch: ['<rootDir>/tests/browser/**/*.test.js'],
  testEnvironment: 'jest-environment-puppeteer',
  testTimeout: 30000,
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(puppeteer|jest-puppeteer)/)'
  ]
};