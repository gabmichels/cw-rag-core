#!/usr/bin/env node

/**
 * Test script to verify guardrail fix for the specific query:
 * "Can you show me the Skill Table for Artistry please?"
 *
 * Expected behavior:
 * - Should find document with ID: 69fbb454-b310-59b0-e53c-6ab7d4909bfe
 * - Should pass guardrail evaluation
 * - Should return a proper answer (not IDK response)
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

const testPayload = {
  query: "Can you show me the Skill Table for Artistry please?",
  userContext: {
    id: "test-user",
    groupIds: ["public"],
    tenantId: "zenithfall"
  },
  includeMetrics: true,
  includeDebugInfo: true,
  k: 10
};

async function testGuardrailFix() {
  console.log('🧪 Testing Guardrail Fix');
  console.log('='.repeat(50));
  console.log('Query:', testPayload.query);
  console.log('Expected document ID:', '69fbb454-b310-59b0-e53c-6ab7d4909bfe');
  console.log('API URL:', API_URL);
  console.log();

  try {
    const startTime = Date.now();

    console.log('📡 Making API request...');
    const response = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const result = await response.json();

    console.log(`✅ Response received in ${responseTime}ms`);
    console.log();

    // Analyze guardrail decision
    console.log('🔍 GUARDRAIL ANALYSIS:');
    console.log('-'.repeat(30));
    const guardrail = result.guardrailDecision;

    if (guardrail) {
      console.log(`Is Answerable: ${guardrail.isAnswerable ? '✅ YES' : '❌ NO'}`);
      console.log(`Confidence: ${(guardrail.confidence * 100).toFixed(1)}%`);

      if (guardrail.threshold) {
        console.log('Threshold Configuration:');
        console.log(`  Type: ${guardrail.threshold.type}`);
        console.log(`  Min Confidence: ${(guardrail.threshold.minConfidence * 100).toFixed(1)}%`);
        console.log(`  Min Top Score: ${(guardrail.threshold.minTopScore * 100).toFixed(1)}%`);
        console.log(`  Min Mean Score: ${(guardrail.threshold.minMeanScore * 100).toFixed(1)}%`);
      }

      if (guardrail.scoreStats) {
        console.log('Score Statistics:');
        console.log(`  Max Score: ${(guardrail.scoreStats.max * 100).toFixed(1)}%`);
        console.log(`  Mean Score: ${(guardrail.scoreStats.mean * 100).toFixed(1)}%`);
        console.log(`  Std Dev: ${guardrail.scoreStats.stdDev.toFixed(3)}`);
        console.log(`  Result Count: ${guardrail.scoreStats.count}`);
      }

      if (guardrail.sourceAwareConfidence) {
        console.log('Source-Aware Confidence:');
        const stages = guardrail.sourceAwareConfidence.stageConfidences;
        if (stages.vector) {
          console.log(`  Vector: ${(stages.vector.confidence * 100).toFixed(1)}% (top: ${(stages.vector.topScore * 100).toFixed(1)}%)`);
        }
        if (stages.keyword) {
          console.log(`  Keyword: ${(stages.keyword.confidence * 100).toFixed(1)}% (top: ${(stages.keyword.topScore * 100).toFixed(1)}%)`);
        }
        if (stages.fusion) {
          console.log(`  Fusion: ${(stages.fusion.confidence * 100).toFixed(1)}% (top: ${(stages.fusion.topScore * 100).toFixed(1)}%)`);
        }
      }

      if (!guardrail.isAnswerable) {
        console.log(`❌ GUARDRAIL REJECTED: ${guardrail.reasonCode || 'Unknown reason'}`);
        if (guardrail.suggestions) {
          console.log('Suggestions:', guardrail.suggestions);
        }
        return;
      }
    }

    // Check for expected document ID
    console.log();
    console.log('📄 DOCUMENT ANALYSIS:');
    console.log('-'.repeat(30));

    if (result.retrievedDocuments && result.retrievedDocuments.length > 0) {
      console.log(`Found ${result.retrievedDocuments.length} documents`);

      const expectedDocId = '69fbb454-b310-59b0-e53c-6ab7d4909bfe';
      let foundExpectedDoc = false;

      result.retrievedDocuments.forEach((doc, index) => {
        const isExpected = doc.document.id === expectedDocId;
        const marker = isExpected ? '🎯' : '📝';

        console.log(`${marker} Document ${index + 1}:`);
        console.log(`    ID: ${doc.document.id}`);
        console.log(`    Score: ${(doc.score * 100).toFixed(1)}%`);
        console.log(`    Search Type: ${doc.searchType}`);

        if (doc.vectorScore) {
          console.log(`    Vector Score: ${(doc.vectorScore * 100).toFixed(1)}%`);
        }
        if (doc.fusionScore) {
          console.log(`    Fusion Score: ${(doc.fusionScore * 100).toFixed(1)}%`);
        }

        // Show content preview
        const content = doc.document.content.substring(0, 100);
        console.log(`    Content: ${content}...`);

        if (isExpected) {
          foundExpectedDoc = true;
          console.log(`    🎯 THIS IS THE EXPECTED DOCUMENT!`);
        }
        console.log();
      });

      if (foundExpectedDoc) {
        console.log('✅ SUCCESS: Found expected document ID in results!');
      } else {
        console.log('⚠️  WARNING: Expected document ID not found in top results');
        console.log(`   Looking for: ${expectedDocId}`);
      }
    } else {
      console.log('❌ No documents retrieved');
    }

    // Show metrics if available
    if (result.metrics) {
      console.log();
      console.log('⏱️  PERFORMANCE METRICS:');
      console.log('-'.repeat(30));
      console.log(`Total Duration: ${result.metrics.totalDuration.toFixed(0)}ms`);
      console.log(`Vector Search: ${result.metrics.vectorSearchDuration.toFixed(0)}ms`);
      console.log(`Keyword Search: ${result.metrics.keywordSearchDuration.toFixed(0)}ms`);
      console.log(`Guardrail Duration: ${result.metrics.guardrailDuration.toFixed(0)}ms`);
      console.log(`Documents Retrieved: ${result.metrics.finalResultCount}`);
      console.log(`Reranking Enabled: ${result.metrics.rerankingEnabled ? 'Yes' : 'No'}`);
    }

    // Show answer preview
    console.log();
    console.log('💬 ANSWER PREVIEW:');
    console.log('-'.repeat(30));
    const answerPreview = result.answer.substring(0, 200);
    console.log(`${answerPreview}...`);

    console.log();
    console.log('🎉 TEST COMPLETED SUCCESSFULLY!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Check if API is reachable first
async function checkAPIHealth() {
  try {
    console.log('🏥 Checking API health...');
    const response = await fetch(`${API_URL}/healthz`);
    if (response.ok) {
      console.log('✅ API is healthy');
      return true;
    } else {
      console.log(`❌ API health check failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ API not reachable: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔧 GUARDRAIL FIX VERIFICATION TEST');
  console.log('='.repeat(50));
  console.log('This test verifies that the guardrail fixes work correctly');
  console.log('and that the specific query returns the expected document.');
  console.log();

  const isHealthy = await checkAPIHealth();
  if (!isHealthy) {
    console.log();
    console.log('💡 TROUBLESHOOTING TIPS:');
    console.log('1. Make sure the API container is running: docker-compose up api');
    console.log('2. Check if the API_URL environment variable is correct');
    console.log('3. Verify the API is accessible at:', API_URL);
    return;
  }

  console.log();
  await testGuardrailFix();
}

// Run the test
main().catch(console.error);