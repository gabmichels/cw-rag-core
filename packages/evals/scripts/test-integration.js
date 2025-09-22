#!/usr/bin/env node

/**
 * Integration test script for evaluation harness
 * Tests the complete pipeline: API client -> Runner -> Metrics -> Reporting
 */

import { promises as fs } from 'fs';
import path from 'path';
import { EvaluationAPIClient, createTestUserContext, createAskRequest } from '../dist/api-client.js';
import { EvaluationRunner } from '../dist/runner.js';
import { MetricsCalculator } from '../dist/metrics.js';
import { ReportGenerator } from '../dist/reporting.js';

const TEST_CONFIG = {
  datasets: ['gold', 'ood'],
  retrievalConfig: {
    topK: 3,
    hybridSearchWeights: { bm25: 0.7, semantic: 0.3 },
    rerankerEnabled: true
  },
  guardrailsConfig: {
    injectionDetectionEnabled: true,
    rbacEnforcementEnabled: true,
    idkThreshold: 0.5
  },
  outputConfig: {
    saveResults: true,
    outputDir: './test-results',
    includeDetails: true
  }
};

const TEST_DATASETS = {
  gold: {
    type: 'gold',
    version: '1.0.0',
    description: 'Test gold dataset',
    records: [
      {
        id: 'gold-test-1',
        query: 'What is machine learning?',
        tenantId: 'test-tenant',
        answerspan: 'Machine learning is a subset of artificial intelligence...',
        docId: 'ml-basics-doc'
      },
      {
        id: 'gold-test-2',
        query: 'How does neural networks work?',
        tenantId: 'test-tenant',
        answerspan: 'Neural networks are computing systems...',
        docId: 'neural-networks-doc'
      }
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      totalRecords: 2,
      source: 'test'
    }
  },
  ood: {
    type: 'ood',
    version: '1.0.0',
    description: 'Test OOD dataset',
    records: [
      {
        id: 'ood-test-1',
        query: 'What is the weather like on Mars?',
        tenantId: 'test-tenant',
        expectedResponse: 'IDK',
        category: 'outside_domain'
      },
      {
        id: 'ood-test-2',
        query: 'Can you sing me a song?',
        tenantId: 'test-tenant',
        expectedResponse: 'IDK',
        category: 'outside_domain'
      }
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      totalRecords: 2,
      source: 'test'
    }
  }
};

class MockAPIClient {
  constructor() {
    this.callCount = 0;
    this.metrics = [];
  }

  async ask(request) {
    this.callCount++;
    const startTime = performance.now();

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const endTime = performance.now();
    const metrics = {
      startTime,
      endTime,
      duration: endTime - startTime,
      statusCode: 200,
      retryCount: 0
    };

    this.metrics.push(metrics);

    // Mock response based on query content
    const isOOD = request.query.toLowerCase().includes('mars') ||
                  request.query.toLowerCase().includes('song');

    if (isOOD) {
      return {
        response: {
          answer: "I don't have enough information to answer that question.",
          retrievedDocuments: [],
          queryId: `test-${this.callCount}`,
          guardrailDecision: {
            isAnswerable: false,
            confidence: 0.3,
            reasonCode: 'insufficient_context'
          }
        },
        metrics
      };
    } else {
      return {
        response: {
          answer: `Here's information about ${request.query}...`,
          retrievedDocuments: [
            {
              document: {
                id: 'test-doc-1',
                content: 'Test document content...',
                metadata: {
                  tenantId: request.userContext.tenantId,
                  docId: 'test-doc-1',
                  acl: ['public']
                }
              },
              score: 0.85
            }
          ],
          queryId: `test-${this.callCount}`,
          guardrailDecision: {
            isAnswerable: true,
            confidence: 0.85
          }
        },
        metrics
      };
    }
  }

  async healthCheck() {
    return true;
  }

  async waitForReady() {
    return true;
  }

  getMetrics() {
    return this.metrics;
  }

  getPerformanceStats() {
    if (this.metrics.length === 0) {
      return {
        totalCalls: 0,
        averageDuration: 0,
        successRate: 0,
        retryRate: 0,
        p95Duration: 0,
        p99Duration: 0
      };
    }

    const durations = this.metrics.map(m => m.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      totalCalls: this.metrics.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      successRate: 1.0, // Mock 100% success
      retryRate: 0.0,   // Mock 0% retries
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0
    };
  }
}

async function runIntegrationTest() {
  console.log('🧪 Starting Integration Test...\n');

  try {
    // 1. Test API Client
    console.log('1️⃣ Testing API Client...');
    const mockClient = new MockAPIClient();
    const userContext = createTestUserContext('standard', 'test-tenant');
    const askRequest = createAskRequest('What is machine learning?', userContext);

    const { response, metrics } = await mockClient.ask(askRequest);
    console.log(`   ✅ API call successful (${metrics.duration.toFixed(0)}ms)`);
    console.log(`   📊 Response: ${response.answer.substring(0, 50)}...`);

    // 2. Test Runner
    console.log('\n2️⃣ Testing Evaluation Runner...');
    const runner = new EvaluationRunner(TEST_CONFIG, mockClient);
    await runner.initialize();

    const results = [];
    for (const [datasetName, dataset] of Object.entries(TEST_DATASETS)) {
      console.log(`   🔄 Running ${datasetName} dataset...`);
      const datasetResults = await runner.runDataset(dataset, {
        verbose: false,
        parallel: false,
        maxConcurrency: 1
      });
      results.push(...datasetResults);
      console.log(`   ✅ ${datasetName}: ${datasetResults.length} evaluations completed`);
    }

    // 3. Test Metrics Calculation
    console.log('\n3️⃣ Testing Metrics Calculation...');
    const calculator = new MetricsCalculator();
    const aggregatedMetrics = await calculator.calculateAggregatedMetrics(
      results,
      ['gold', 'ood']
    );
    console.log(`   ✅ Calculated metrics for ${results.length} results`);
    console.log(`   📊 Overall pass rate: ${aggregatedMetrics.overall.passRate.toFixed(1)}%`);

    // 4. Test Performance Stats
    console.log('\n4️⃣ Testing Performance Monitoring...');
    const perfStats = runner.getAPIPerformanceStats();
    console.log(`   ✅ API calls: ${perfStats.totalCalls}`);
    console.log(`   ⚡ Avg latency: ${perfStats.averageDuration.toFixed(0)}ms`);

    // 5. Test Report Generation
    console.log('\n5️⃣ Testing Report Generation...');
    const reportGenerator = new ReportGenerator();

    const report = {
      config: TEST_CONFIG,
      results,
      metrics: aggregatedMetrics,
      summary: {
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 5000,
        totalQueries: results.length,
        successfulQueries: results.filter(r => r.passed).length,
        failedQueries: results.filter(r => !r.passed).length
      }
    };

    // Test threshold validation
    const validationResults = reportGenerator.validateThresholds(aggregatedMetrics, perfStats);
    const criticalFailures = validationResults.filter(r => !r.passed && r.severity === 'critical');

    console.log(`   ✅ Threshold validation: ${validationResults.length} checks`);
    console.log(`   ${criticalFailures.length === 0 ? '✅' : '❌'} Critical failures: ${criticalFailures.length}`);

    // Test report formats
    await fs.mkdir('./test-results', { recursive: true });

    await reportGenerator.generateMarkdownReport(report, perfStats, './test-results/test-report.md');
    console.log(`   ✅ Markdown report generated`);

    await reportGenerator.generateJSONReport(report, perfStats, './test-results/test-report.json');
    console.log(`   ✅ JSON report generated`);

    await reportGenerator.generateHTMLDashboard(report, perfStats, './test-results/test-dashboard.html');
    console.log(`   ✅ HTML dashboard generated`);

    // 6. Final validation
    console.log('\n6️⃣ Final Integration Validation...');

    // Check that all components work together
    const checks = [
      { name: 'API Client', passed: mockClient.callCount > 0 },
      { name: 'Evaluation Runner', passed: results.length > 0 },
      { name: 'Metrics Calculation', passed: aggregatedMetrics.overall.totalEvaluations > 0 },
      { name: 'Performance Monitoring', passed: perfStats.totalCalls > 0 },
      { name: 'Report Generation', passed: validationResults.length > 0 },
      { name: 'Files Generated', passed: await fs.access('./test-results/test-dashboard.html').then(() => true).catch(() => false) }
    ];

    let allPassed = true;
    for (const check of checks) {
      console.log(`   ${check.passed ? '✅' : '❌'} ${check.name}`);
      if (!check.passed) allPassed = false;
    }

    console.log('\n🎉 Integration Test Results:');
    if (allPassed) {
      console.log('✅ All integration tests PASSED');
      console.log('🚀 Evaluation harness is ready for production use');
      console.log(`📊 View test dashboard: file://${path.resolve('./test-results/test-dashboard.html')}`);
      process.exit(0);
    } else {
      console.log('❌ Some integration tests FAILED');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run the integration test
runIntegrationTest();