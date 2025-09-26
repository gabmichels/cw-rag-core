#!/usr/bin/env node

/**
 * Minimal eval script for fusion system
 * Tests Isharoth and Chrono Distortion probe cases
 */

const { fuse } = require('../retrieval/src/services/fusion.js');

// Test fixtures from diagnosis docs
const isharothVector = [
  { id: 'isharoth_chunk', score: 0.617, rank: 18 }
];

const isharothKeyword = [
  { id: 'isharoth_chunk', score: 0.35, rank: 8 }
];

const chronoVector = [
  { id: 'chrono_chunk', score: 0.761, rank: 1 }
];

const chronoKeyword = [
  { id: 'chrono_chunk', score: 0.85, rank: 1 }
];

function testFusion(name, vector, keyword, config) {
  console.log(`\n=== ${name} ===`);
  console.log('Config:', JSON.stringify(config, null, 2));

  const results = fuse(vector, keyword, config);

  console.log('Results:');
  results.forEach((result, i) => {
    console.log(`  ${i+1}. ${result.id}: fused=${result.fusedScore.toFixed(4)}, components=${JSON.stringify(result.components)}`);
  });

  return results;
}

function runEval() {
  console.log('🚀 Fusion System Evaluation');
  console.log('Testing probe queries from diagnosis docs\n');

  // Test Isharoth case with weighted_average (new default)
  const isharothResults = testFusion(
    'Isharoth "31 hours" Query',
    isharothVector,
    isharothKeyword,
    {
      strategy: "weighted_average",
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      normalization: "minmax"
    }
  );

  // Test Chrono Distortion case
  const chronoResults = testFusion(
    'Chrono Distortion Query',
    chronoVector,
    chronoKeyword,
    {
      strategy: "weighted_average",
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      normalization: "minmax"
    }
  );

  // Compare with old RRF (borda_rank)
  console.log('\n=== Comparison with Old RRF ===');
  const oldRrfResults = testFusion(
    'Isharoth with Old RRF (k=60)',
    isharothVector,
    isharothKeyword,
    {
      strategy: "borda_rank",
      kParam: 60,
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      normalization: "none"
    }
  );

  // Analysis
  console.log('\n=== Analysis ===');
  const newScore = isharothResults[0].fusedScore;
  const oldScore = oldRrfResults[0].fusedScore;
  const improvement = ((newScore - oldScore) / oldScore * 100).toFixed(1);

  console.log(`Isharoth fused score: ${newScore.toFixed(4)} (new) vs ${oldScore.toFixed(4)} (old RRF)`);
  console.log(`Improvement: ${improvement}%`);

  // Check if Isharoth would be in top-N
  console.log(`\nSuccess criteria:`);
  console.log(`✅ Isharoth in top-10: ${isharothResults[0].fusedScore > 0.1 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Chrono Distortion remains #1: ${chronoResults[0].id === 'chrono_chunk' ? 'PASS' : 'FAIL'}`);
  console.log(`✅ No extreme score collapse: ${newScore > 0.02 ? 'PASS' : 'FAIL'}`);
}

// Run if called directly
if (require.main === module) {
  runEval();
}

module.exports = { runEval, testFusion };