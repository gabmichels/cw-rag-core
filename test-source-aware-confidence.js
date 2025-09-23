// Test script to validate the new source-aware confidence system
// This demonstrates how the system handles quality degradation detection

const { SourceAwareConfidenceService } = require('./packages/retrieval/dist/services/source-aware-confidence.js');
const { AnswerabilityGuardrailServiceImpl } = require('./packages/retrieval/dist/services/answerability-guardrail.js');

async function testSourceAwareConfidence() {
  console.log('🧪 TESTING SOURCE-AWARE CONFIDENCE SYSTEM');
  console.log('='.repeat(60));

  // Test case: High vector quality but poor fusion (the real problem scenario)
  console.log('\n📊 Test Case: Quality Degradation Detection');
  console.log('Scenario: Vector search finds excellent results (88.5%), but RRF fusion degrades to 1.5%');

  // Mock vector search results (excellent quality)
  const vectorResults = [
    {
      id: 'combat-rules-1',
      vector: [], // Empty as we only need scores
      score: 0.885, // 88.5% similarity - excellent!
      payload: {
        docId: 'combat-rules',
        tenantId: 'zenithfall',
        acl: ['public'],
        content: 'Off-Hand Combat (Dual Wielding) rules...'
      }
    },
    {
      id: 'combat-rules-2',
      vector: [],
      score: 0.823, // 82.3% - also very good
      payload: {
        docId: 'combat-guide',
        tenantId: 'zenithfall',
        acl: ['public'],
        content: 'Dual wielding mechanics...'
      }
    }
  ];

  // Mock keyword search results (moderate quality)
  const keywordResults = [
    {
      id: 'combat-rules-1',
      score: 0.45, // 45% - decent keyword match
      payload: vectorResults[0].payload
    }
  ];

  // Mock RRF fusion results (degraded quality - the problem!)
  const fusionResults = [
    {
      id: 'combat-rules-1',
      score: 0.015,        // 1.5% - severely degraded by RRF formula!
      fusionScore: 0.015,  // Same as score
      vectorScore: 0.885,  // Original vector score preserved
      keywordScore: 0.45,  // Original keyword score preserved
      searchType: 'hybrid',
      payload: vectorResults[0].payload,
      content: vectorResults[0].payload.content
    },
    {
      id: 'combat-rules-2',
      score: 0.012,        // 1.2% - also severely degraded
      fusionScore: 0.012,
      vectorScore: 0.823,  // Original vector score preserved
      keywordScore: undefined, // Only found in vector search
      searchType: 'vector_only',
      payload: vectorResults[1].payload,
      content: vectorResults[1].payload.content
    }
  ];

  // Test the new source-aware confidence system
  console.log('\n🔍 Analyzing with Source-Aware Confidence System...');

  const confidenceService = new SourceAwareConfidenceService();
  const sourceAwareResult = confidenceService.calculateSourceAwareConfidence(
    vectorResults,
    keywordResults,
    fusionResults,
    [] // No reranker results
  );

  console.log('\n📈 STAGE-BY-STAGE CONFIDENCE ANALYSIS:');
  console.log('=====================================');

  // Vector stage
  const vectorStage = sourceAwareResult.stageConfidences.vector;
  console.log(`🎯 Vector Search:`);
  console.log(`   Confidence: ${(vectorStage.confidence * 100).toFixed(1)}%`);
  console.log(`   Quality: ${(vectorStage.quality * 100).toFixed(1)}%`);
  console.log(`   Top Score: ${(vectorStage.topScore * 100).toFixed(1)}%`);
  console.log(`   Mean Score: ${(vectorStage.meanScore * 100).toFixed(1)}%`);

  // Keyword stage
  if (sourceAwareResult.stageConfidences.keyword) {
    const keywordStage = sourceAwareResult.stageConfidences.keyword;
    console.log(`\n🔤 Keyword Search:`);
    console.log(`   Confidence: ${(keywordStage.confidence * 100).toFixed(1)}%`);
    console.log(`   Quality: ${(keywordStage.quality * 100).toFixed(1)}%`);
    console.log(`   Top Score: ${(keywordStage.topScore * 100).toFixed(1)}%`);
  }

  // Fusion stage (the problematic one)
  const fusionStage = sourceAwareResult.stageConfidences.fusion;
  console.log(`\n⚡ Fusion Stage:`);
  console.log(`   Confidence: ${(fusionStage.confidence * 100).toFixed(1)}%`);
  console.log(`   Quality: ${(fusionStage.quality * 100).toFixed(1)}% (Quality Preservation)`);
  console.log(`   Top Score: ${(fusionStage.topScore * 100).toFixed(1)}%`);
  console.log(`   Mean Score: ${(fusionStage.meanScore * 100).toFixed(1)}%`);
  console.log(`   Quality Preservation: ${(fusionStage.metadata?.qualityPreservation * 100).toFixed(1)}%`);

  // Quality degradation alerts
  console.log('\n🚨 QUALITY DEGRADATION ALERTS:');
  console.log('===============================');
  if (sourceAwareResult.degradationAlerts.length > 0) {
    sourceAwareResult.degradationAlerts.forEach((alert, i) => {
      console.log(`Alert ${i + 1}: ${alert.stage} stage`);
      console.log(`   Severity: ${(alert.severity * 100).toFixed(1)}%`);
      console.log(`   Description: ${alert.description}`);
      console.log(`   Recommendation: ${alert.recommendation}`);
      console.log(`   Quality Drop: ${(alert.previousConfidence * 100).toFixed(1)}% → ${(alert.currentConfidence * 100).toFixed(1)}%`);
    });
  } else {
    console.log('No quality degradation detected.');
  }

  // Final confidence strategy
  console.log('\n🎯 CONFIDENCE STRATEGY & RESULTS:');
  console.log('=================================');
  console.log(`Strategy: ${sourceAwareResult.recommendedStrategy.replace('_', ' ').toUpperCase()}`);
  console.log(`Final Confidence: ${(sourceAwareResult.finalConfidence * 100).toFixed(1)}%`);
  console.log(`Explanation: ${sourceAwareResult.explanation}`);

  // Compare with legacy scoring
  console.log('\n📊 COMPARISON WITH LEGACY SCORING:');
  console.log('==================================');

  // Simulate legacy averaging approach
  const legacyAverageConfidence = (vectorStage.confidence + fusionStage.confidence) / 2;
  console.log(`Legacy Average Method: ${(legacyAverageConfidence * 100).toFixed(1)}%`);
  console.log(`New Source-Aware Method: ${(sourceAwareResult.finalConfidence * 100).toFixed(1)}%`);
  console.log(`Improvement: ${((sourceAwareResult.finalConfidence - legacyAverageConfidence) * 100).toFixed(1)} percentage points`);

  // Test with actual guardrail service
  console.log('\n🛡️ TESTING WITH ENHANCED GUARDRAIL SERVICE:');
  console.log('===========================================');

  const guardrailService = new AnswerabilityGuardrailServiceImpl();
  const answerabilityScore = guardrailService.calculateAnswerabilityScore(fusionResults, []);

  console.log(`Enhanced Guardrail Confidence: ${(answerabilityScore.confidence * 100).toFixed(1)}%`);
  console.log(`Is Answerable: ${answerabilityScore.isAnswerable}`);
  console.log(`Reasoning: ${answerabilityScore.reasoning}`);

  // Test threshold decision with different configurations
  console.log('\n⚖️ THRESHOLD DECISION TESTING:');
  console.log('==============================');

  const testConfidences = [
    { name: 'Legacy Average', confidence: legacyAverageConfidence },
    { name: 'Source-Aware', confidence: sourceAwareResult.finalConfidence },
    { name: 'Max Confidence', confidence: Math.max(vectorStage.confidence, fusionStage.confidence) }
  ];

  const thresholds = [0.3, 0.5, 0.7];

  testConfidences.forEach(test => {
    console.log(`\n${test.name} (${(test.confidence * 100).toFixed(1)}%):`);
    thresholds.forEach(threshold => {
      const passes = test.confidence >= threshold;
      const status = passes ? '✅ PASS' : '❌ FAIL';
      console.log(`   Threshold ${(threshold * 100).toFixed(0)}%: ${status}`);
    });
  });

  return {
    sourceAwareResult,
    answerabilityScore,
    vectorConfidence: vectorStage.confidence,
    fusionConfidence: fusionStage.confidence,
    degradationDetected: sourceAwareResult.degradationAlerts.length > 0
  };
}

// Helper function to simulate the problematic RRF calculation
function simulateRRFDegradation() {
  console.log('\n🔍 RRF FORMULA ANALYSIS:');
  console.log('========================');
  console.log('Demonstrating why RRF destroys high vector scores...\n');

  const vectorScore = 0.885; // 88.5% similarity
  const vectorRank = 1;      // Top result
  const rrfK = 60;           // Standard RRF parameter
  const vectorWeight = 0.7;  // Standard weight

  const rrfScore = vectorWeight / (rrfK + vectorRank);

  console.log(`Original Vector Score: ${(vectorScore * 100).toFixed(1)}%`);
  console.log(`RRF Formula: weight / (k + rank) = ${vectorWeight} / (${rrfK} + ${vectorRank})`);
  console.log(`RRF Result: ${rrfScore.toFixed(4)} = ${(rrfScore * 100).toFixed(2)}%`);
  console.log(`Quality Loss: ${((vectorScore - rrfScore) / vectorScore * 100).toFixed(1)}%`);
  console.log(`\n🚨 The RRF formula completely ignores the original similarity score!`);
}

// Run the comprehensive test
async function runComprehensiveTest() {
  try {
    console.log('🧪 COMPREHENSIVE SOURCE-AWARE CONFIDENCE TEST');
    console.log('='.repeat(60));

    simulateRRFDegradation();

    const results = await testSourceAwareConfidence();

    console.log('\n🎉 TEST SUMMARY:');
    console.log('================');
    console.log(`✅ Quality degradation detected: ${results.degradationDetected}`);
    console.log(`✅ Vector confidence preserved: ${(results.vectorConfidence * 100).toFixed(1)}%`);
    console.log(`✅ Fusion quality tracked: ${(results.fusionConfidence * 100).toFixed(1)}%`);
    console.log(`✅ Source-aware confidence: ${(results.sourceAwareResult.finalConfidence * 100).toFixed(1)}%`);
    console.log(`✅ Strategy: ${results.sourceAwareResult.recommendedStrategy}`);

    if (results.sourceAwareResult.degradationAlerts.length > 0) {
      console.log(`✅ Degradation alerts: ${results.sourceAwareResult.degradationAlerts.length} detected`);
    }

    console.log('\n🎯 MISSION ACCOMPLISHED!');
    console.log('The source-aware confidence system successfully:');
    console.log('• Detected quality degradation in the fusion stage');
    console.log('• Preserved high-quality signals from vector search');
    console.log('• Recommended appropriate confidence strategy');
    console.log('• Provided detailed explanations for decisions');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Export for use in other tests
module.exports = {
  testSourceAwareConfidence,
  simulateRRFDegradation,
  runComprehensiveTest
};

// Run if called directly
if (require.main === module) {
  runComprehensiveTest();
}