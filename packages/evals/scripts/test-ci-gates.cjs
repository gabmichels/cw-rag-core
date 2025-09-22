#!/usr/bin/env node

/**
 * Test script to verify CI threshold gates work correctly
 *
 * This script creates mock evaluation results with different threshold outcomes
 * to test that the CI gates properly fail when thresholds are not met.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create mock evaluation results for testing
function createMockResults(scenario) {
  const baseResult = {
    timestamp: new Date().toISOString(),
    config: {
      datasets: ['gold', 'ood', 'inject', 'rbac'],
      retrievalConfig: { topK: 5 },
      apiConfig: { baseUrl: 'http://localhost:3000' }
    },
    results: [],
    summary: {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 30000,
      totalQueries: 20,
      successfulQueries: 18,
      failedQueries: 2
    }
  };

  const scenarios = {
    // All thresholds pass
    pass: {
      metrics: {
        overall: { totalEvaluations: 20, passRate: 90, avgExecutionTime: 250 },
        gold: {
          recallAt5: { recall: 0.87, relevantFound: 17, totalRelevant: 20, k: 5 },
          recallAt1: { recall: 0.65, relevantFound: 13, totalRelevant: 20, k: 1 },
          mrr: { mrr: 0.72, queriesWithRelevant: 18, totalQueries: 20 }
        },
        ood: {
          precision: 0.92,
          recall: 0.88,
          f1Score: 0.90,
          truePositives: 4,
          falsePositives: 0,
          falseNegatives: 1,
          trueNegatives: 0
        },
        injection: {
          bypassRate: 0.01,
          detectionRate: 0.99,
          totalAttempts: 5,
          successfulBypasses: 0,
          detectedAttacks: 5
        },
        rbac: {
          leakRate: 0.00,
          enforcementRate: 1.00,
          totalQueries: 5,
          unauthorizedAccess: 0,
          properlyBlocked: 5
        }
      }
    },

    // Recall@5 fails (0.80 < 0.85)
    fail_recall: {
      metrics: {
        overall: { totalEvaluations: 20, passRate: 75, avgExecutionTime: 250 },
        gold: {
          recallAt5: { recall: 0.80, relevantFound: 16, totalRelevant: 20, k: 5 }, // FAILS
          recallAt1: { recall: 0.55, relevantFound: 11, totalRelevant: 20, k: 1 },
          mrr: { mrr: 0.68, queriesWithRelevant: 16, totalQueries: 20 }
        },
        ood: {
          precision: 0.92,
          recall: 0.88,
          f1Score: 0.90,
          truePositives: 4,
          falsePositives: 0,
          falseNegatives: 1,
          trueNegatives: 0
        },
        injection: {
          bypassRate: 0.01,
          detectionRate: 0.99,
          totalAttempts: 5,
          successfulBypasses: 0,
          detectedAttacks: 5
        },
        rbac: {
          leakRate: 0.00,
          enforcementRate: 1.00,
          totalQueries: 5,
          unauthorizedAccess: 0,
          properlyBlocked: 5
        }
      }
    },

    // IDK precision fails (0.85 < 0.90)
    fail_idk: {
      metrics: {
        overall: { totalEvaluations: 20, passRate: 80, avgExecutionTime: 250 },
        gold: {
          recallAt5: { recall: 0.87, relevantFound: 17, totalRelevant: 20, k: 5 },
          recallAt1: { recall: 0.65, relevantFound: 13, totalRelevant: 20, k: 1 },
          mrr: { mrr: 0.72, queriesWithRelevant: 18, totalQueries: 20 }
        },
        ood: {
          precision: 0.85, // FAILS
          recall: 0.80,
          f1Score: 0.82,
          truePositives: 3,
          falsePositives: 1,
          falseNegatives: 1,
          trueNegatives: 0
        },
        injection: {
          bypassRate: 0.01,
          detectionRate: 0.99,
          totalAttempts: 5,
          successfulBypasses: 0,
          detectedAttacks: 5
        },
        rbac: {
          leakRate: 0.00,
          enforcementRate: 1.00,
          totalQueries: 5,
          unauthorizedAccess: 0,
          properlyBlocked: 5
        }
      }
    },

    // RBAC leak rate fails (0.20 > 0.00)
    fail_rbac: {
      metrics: {
        overall: { totalEvaluations: 20, passRate: 70, avgExecutionTime: 250 },
        gold: {
          recallAt5: { recall: 0.87, relevantFound: 17, totalRelevant: 20, k: 5 },
          recallAt1: { recall: 0.65, relevantFound: 13, totalRelevant: 20, k: 1 },
          mrr: { mrr: 0.72, queriesWithRelevant: 18, totalQueries: 20 }
        },
        ood: {
          precision: 0.92,
          recall: 0.88,
          f1Score: 0.90,
          truePositives: 4,
          falsePositives: 0,
          falseNegatives: 1,
          trueNegatives: 0
        },
        injection: {
          bypassRate: 0.01,
          detectionRate: 0.99,
          totalAttempts: 5,
          successfulBypasses: 0,
          detectedAttacks: 5
        },
        rbac: {
          leakRate: 0.20, // FAILS
          enforcementRate: 0.80,
          totalQueries: 5,
          unauthorizedAccess: 1,
          properlyBlocked: 4
        }
      }
    },

    // Injection bypass fails (0.05 > 0.02)
    fail_injection: {
      metrics: {
        overall: { totalEvaluations: 20, passRate: 85, avgExecutionTime: 250 },
        gold: {
          recallAt5: { recall: 0.87, relevantFound: 17, totalRelevant: 20, k: 5 },
          recallAt1: { recall: 0.65, relevantFound: 13, totalRelevant: 20, k: 1 },
          mrr: { mrr: 0.72, queriesWithRelevant: 18, totalQueries: 20 }
        },
        ood: {
          precision: 0.92,
          recall: 0.88,
          f1Score: 0.90,
          truePositives: 4,
          falsePositives: 0,
          falseNegatives: 1,
          trueNegatives: 0
        },
        injection: {
          bypassRate: 0.05, // FAILS
          detectionRate: 0.95,
          totalAttempts: 5,
          successfulBypasses: 1,
          detectedAttacks: 4
        },
        rbac: {
          leakRate: 0.00,
          enforcementRate: 1.00,
          totalQueries: 5,
          unauthorizedAccess: 0,
          properlyBlocked: 5
        }
      }
    }
  };

  return { ...baseResult, ...scenarios[scenario] };
}

async function testScenario(scenario, expectSuccess) {
  console.log(`\n🧪 Testing scenario: ${scenario} (expecting ${expectSuccess ? 'success' : 'failure'})`);

  // Create test results
  const mockResults = createMockResults(scenario);
  const testDir = `./test-results-${scenario}`;

  // Create test directory and write mock results
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(testDir, 'evaluation-report.json'),
    JSON.stringify(mockResults, null, 2)
  );

  try {
    // Run validation script
    const output = execSync(
      `node scripts/validate-ci-thresholds.cjs ${testDir}/evaluation-report.json`,
      { encoding: 'utf8', cwd: process.cwd() }
    );

    console.log('📤 Validation output:');
    console.log(output);

    if (expectSuccess) {
      console.log('✅ Test passed: Validation succeeded as expected');
      return true;
    } else {
      console.log('❌ Test failed: Expected validation to fail but it passed');
      return false;
    }

  } catch (error) {
    if (!expectSuccess) {
      console.log('✅ Test passed: Validation failed as expected');
      console.log(`📤 Error output: ${error.message}`);
      return true;
    } else {
      console.log('❌ Test failed: Expected validation to pass but it failed');
      console.log(`📤 Error output: ${error.message}`);
      return false;
    }
  } finally {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  }
}

async function runTests() {
  console.log('🚀 Testing CI Threshold Gates');
  console.log('==============================');

  const testCases = [
    { scenario: 'pass', expectSuccess: true },
    { scenario: 'fail_recall', expectSuccess: false },
    { scenario: 'fail_idk', expectSuccess: false },
    { scenario: 'fail_rbac', expectSuccess: false },
    { scenario: 'fail_injection', expectSuccess: false }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    try {
      const success = await testScenario(testCase.scenario, testCase.expectSuccess);
      if (success) passedTests++;
    } catch (error) {
      console.log(`❌ Test ${testCase.scenario} encountered error: ${error.message}`);
    }
  }

  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All CI threshold gate tests passed!');
    console.log('✅ The CI gates are properly configured and will fail when thresholds are not met.');
    process.exit(0);
  } else {
    console.log('\n💥 Some CI threshold gate tests failed!');
    console.log('❌ The CI gates may not be working correctly.');
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { createMockResults, testScenario };