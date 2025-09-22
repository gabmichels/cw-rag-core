/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@cw-rag-core/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@cw-rag-core/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@cw-rag-core/retrieval$': '<rootDir>/../../packages/retrieval/src/index.ts',
    '^@cw-rag-core/retrieval/(.*)$': '<rootDir>/../../packages/retrieval/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext'
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!@cw-rag-core)'
  ],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  clearMocks: true,
  restoreMocks: true
};

module.exports = config;