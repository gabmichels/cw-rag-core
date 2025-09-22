module.exports = {
  extends: ["../../.eslintrc.cjs"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ["jest.config.cjs"],
  rules: {
    // Add any specific rules for the evals package here
  },
};