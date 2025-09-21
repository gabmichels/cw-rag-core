import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@cw-rag-core/shared(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@cw-rag-core/retrieval(.*)$': '<rootDir>/../../packages/retrieval/src/$1',
  },
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  clearMocks: true,
};

export default config;