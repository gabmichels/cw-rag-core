# Test Coverage Expansion Implementation Plan

## Overview

This plan outlines the systematic expansion of test coverage across the cw-rag-core codebase to ensure robust guardrails before the massive clean code refactoring. The expansion focuses on three main areas:

1. **Unit Test Coverage**: Increase coverage in existing packages to 80%+ across statements, branches, and functions
2. **API Test Coverage**: Fix and expand existing API tests in apps/api

These initiatives are tackled together for synergy: Unit tests provide foundation, integration tests validate service interactions, and E2E tests ensure end-to-end reliability. The plan emphasizes best practices (Jest, mocking, fixtures) and maintains backwards compatibility.

**Timeline Estimate**: 3-4 weeks (Unit: 1-2 weeks, API Tests: 1 week, CI/CD: 1 week)
**Key Principles**: Comprehensive coverage, maintainable tests, CI/CD integration, zero breaking changes

## Objectives

- Achieve 80%+ test coverage across all packages (statements, branches, functions)
- Fix 4 failing API tests and expand coverage to 80%+ in apps/api
- Fix hanging test issues and async operation leaks
- Maintain stable APIs, RBAC, and existing functionality
- Achieve measurable quality gains (80% coverage, 0 failing API tests, 80%+ API coverage)
- Ensure scalability: Tests run in <5 minutes, support parallel execution

## Current Status Quo

### Test Coverage by Package

| Package | Test Suites | Tests | Coverage (Stmt/Branch/Func) | Status |
|---------|-------------|-------|-----------------------------|--------|
| packages/evals | 4 passed | 32 passed | 20.62% / 11.02% / 22.34% | Low coverage, needs expansion |
| packages/ingestion-sdk | 5 passed | 83 passed | 78.63% / 74.19% / 69.04% | Good coverage, minor gaps |
| packages/retrieval | 11 failed, 5 passed | 18 failed, 109 passed | 73.89% / 59.94% / 76.04% | Mixed, failing tests need fixes |
| packages/shared | 7 passed | 82 passed | 49.33% / 43.2% / 47.22% | Moderate coverage, needs expansion |
| apps/api | 9 passed, 1 failed | 131 tests (127 passed, 4 failed) | 51.99% statements, 71.69% branches, 67.64% functions | Tests working, need to fix 4 failing tests |
| apps/web | N/A | N/A | 0% | UI-focused, defer for now |

### Key Issues Identified

1. **Hanging Tests**: packages/shared and packages/retrieval have async operations that don't clean up properly
2. **Failing Tests**: packages/retrieval has 18 failing tests due to import issues and test logic errors
3. **Missing Coverage**: packages/evals and packages/shared have low coverage in core services
4. **Broken API Tests**: apps/api has ~13 test files but they don't run due to dependency issues
5. **Import Issues**: Some tests fail due to module resolution problems in monorepo setup

## Phases and Tasks

### Phase 1: Fix Existing Test Issues (Foundation Layer)

Fix hanging tests, failing tests, and import issues to establish stable baseline.

- [ ] **Fix Hanging Tests**: Add proper cleanup for async operations in packages/shared and packages/retrieval
- [ ] **Fix Failing Tests**: Resolve import issues and test logic errors in packages/retrieval
- [ ] **Update Jest Configuration**: Ensure proper module resolution across monorepo packages
- [ ] **Add Test Timeouts**: Prevent tests from hanging indefinitely

#### Test Phase 1.1: Stability Testing

- [ ] **Async Cleanup Tests**: Verify all tests exit cleanly without hanging
- [ ] **Import Resolution Tests**: Ensure all test suites can load dependencies
- [ ] **CI Pipeline Tests**: Confirm tests pass in automated environment
- [ ] **Performance Tests**: Ensure test execution completes within reasonable time

### Phase 2: Expand Unit Test Coverage (Core Layer)

Increase coverage in existing packages to 80%+ through targeted test additions.

- [ ] **Expand packages/evals Coverage**: Add tests for api-client.ts, reporting.ts, runner.ts
- [ ] **Expand packages/shared Coverage**: Add tests for configuration-service.ts, feature-extractor.ts, language-router.ts, query-builder.ts
- [ ] **Expand packages/retrieval Coverage**: Add tests for embedding.ts, services/http-reranker.ts, services/sentence-transformers-reranker.ts
- [ ] **Improve packages/ingestion-sdk Coverage**: Add tests for detectors/iban.ts, detectors/national-id.ts

#### Test Phase 2.1: Coverage Expansion Testing

- [ ] **Coverage Threshold Tests**: Verify 80%+ coverage across all metrics
- [ ] **New Test Validation**: Ensure new tests provide meaningful coverage
- [ ] **Regression Tests**: Confirm existing functionality still works
- [ ] **Mock Quality Tests**: Validate test doubles don't hide real issues

### Phase 3: Fix and Expand API Tests (API Layer)

Fix failing API tests and expand coverage to 80%+ in apps/api.

- [ ] **Fix Failing Tests**: Resolve 4 failing tests in answer-synthesis.test.ts
- [ ] **Enable Disabled Tests**: Re-enable .disabled test files and fix any issues
- [ ] **Expand Test Coverage**: Add tests to reach 80%+ coverage in apps/api
- [ ] **Add Integration Tests**: Add tests for full request/response cycles
- [ ] **Test Error Scenarios**: Add comprehensive error handling tests
- [ ] **Validate API Contracts**: Ensure all endpoints return expected responses

#### Test Phase 3.1: API Testing

- [ ] **Fix Validation Tests**: Ensure all 4 failing tests pass
- [ ] **Coverage Analysis Tests**: Verify 80%+ coverage achieved
- [ ] **Integration Tests**: Test full request/response cycles
- [ ] **Error Scenario Tests**: Validate error handling and status codes
- [ ] **Performance Tests**: Monitor API response times and reliability

### Phase 4: CI/CD Integration and Optimization

Integrate comprehensive test suite into CI/CD pipeline and optimize for speed.

- [ ] **Parallel Test Execution**: Configure Jest to run tests in parallel
- [ ] **Coverage Reporting**: Set up coverage badges and detailed reports
- [ ] **Test Caching**: Implement intelligent test caching for faster runs
- [ ] **Flaky Test Detection**: Add mechanisms to identify and fix flaky tests

#### Test Phase 5.1: CI/CD Testing

- [ ] **Pipeline Integration Tests**: Verify tests run correctly in CI environment
- [ ] **Performance Benchmarks**: Ensure test suite runs in <5 minutes
- [ ] **Coverage Gates**: Implement coverage thresholds that block merges
- [ ] **Quality Gates**: Add linting and type checking to test pipeline

## Scalability and Best Practices

- **Scalability**: Parallel test execution, efficient mocking, database test isolation
- **Best Practices**: Jest best practices, meaningful test names, AAA pattern, comprehensive mocking
- **Code Quality**: Tests as documentation, maintainable test code, clear assertions
- **Monitoring**: Coverage trends, test execution times, failure rates
- **Security**: Safe test data, no production data in tests, secure credential handling

## Acceptance Criteria

- [ ] Test Stability: All tests pass and exit cleanly without hanging
- [ ] Unit Coverage: 80%+ coverage across all packages (statements, branches, functions)
- [ ] API Test Coverage: 0 failing API tests, 80%+ coverage in apps/api
- [ ] Performance: Test suite executes in <5 minutes
- [ ] CI/CD: Tests integrated into pipeline with coverage gates
- [ ] Quality: No flaky tests, comprehensive error scenario coverage

## Risk Mitigation

- **High Risk**: API test dependency issues - mitigated by fixing import resolution
- **Medium Risk**: Database test isolation - mitigated by proper cleanup and transactions
- **Low Risk**: Coverage expansion - minimal behavioral impact, easily revertible

## Success Metrics

- Test coverage: 80%+ across all metrics for all packages
- Test execution time: <5 minutes for full suite
- API test execution: 0 failing tests in apps/api, 80%+ coverage
- CI/CD integration: Automated testing with coverage gates
- Test stability: 0 hanging tests, 0 flaky tests

## Next Steps

Track progress with checkboxes. Start with Phase 1 (Fix Existing Issues) as it has highest immediate impact on stability. Each phase includes comprehensive testing to ensure quality. Confirm completion of this plan before proceeding to implementation.