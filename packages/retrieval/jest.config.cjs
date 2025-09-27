// jest.config.cjs
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        target: 'es2022',
        types: ['jest', 'node']
      }
    }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@xenova/transformers)/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '@cw-rag-core/shared': '<rootDir>/../shared/src',
    '@xenova/transformers': '<rootDir>/__mocks__/@xenova/transformers.mjs'
  },
  collectCoverage: false,
  verbose: true,
  testTimeout: 60000,
  forceExit: true,
  detectOpenHandles: true
};