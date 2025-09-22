module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ['./tsconfig.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
    ecmaVersion: 2021,
    sourceType: "module"
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  rules: {
    // Add any specific rules for the monorepo root here
     "@typescript-eslint/no-unused-vars": ["off", { "argsIgnorePattern": "^_" }],
     "@typescript-eslint/no-explicit-any": "off"
  },
  env: {
    node: true,
    es2021: true
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "*.js",
    "*.d.ts",
    "jest.config.ts",
    ".*js",
    "apps/web/tailwind.config.ts",
    "apps/web/.next/",
    "apps/*/coverage/",
    "**/build/",
    "**/dist/"
  ]
};