// Debug script to test guardrail threshold configuration
const { createAnswerabilityGuardrailService } = require('./packages/retrieval/dist/services/answerability-guardrail.js');

async function debugThresholdConfig() {
  console.log('🔍 Environment Variables:');
  console.log('ANSWERABILITY_THRESHOLD:', process.env.ANSWERABILITY_THRESHOLD);
  console.log('NODE_ENV:', process.env.NODE_ENV);

  // Create guardrail service
  console.log('\n📦 Creating guardrail service...');
  const guardrailService = createAnswerabilityGuardrailService();

  // Get tenant config
  console.log('\n🏢 Getting default tenant config...');
  const config = await guardrailService.getTenantConfig('default');

  console.log('\n📊 Threshold Configuration:');
  console.log('Type:', config.threshold.type);
  console.log('minConfidence:', config.threshold.minConfidence);
  console.log('minTopScore:', config.threshold.minTopScore);
  console.log('minMeanScore:', config.threshold.minMeanScore);
  console.log('maxStdDev:', config.threshold.maxStdDev);
  console.log('minResultCount:', config.threshold.minResultCount);

  // Test with sample score
  console.log('\n🧪 Testing with sample answerability score...');
  const sampleScore = {
    confidence: 0.274,
    scoreStats: {
      mean: 0.885,      // High mean score from vector search
      max: 0.885,       // High max score from vector search
      min: 0.2,
      stdDev: 0.2,      // Reasonable variance
      count: 10         // Good number of results
    },
    algorithmScores: {
      statistical: 0.8,
      threshold: 0.7,
      mlFeatures: 0.6,
      rerankerConfidence: 0.5
    },
    isAnswerable: false,
    reasoning: 'Test reasoning',
    computationTime: 0
  };

  // Test the threshold decision logic manually
  console.log('\n🎯 Testing threshold checks:');
  const checks = [
    { name: 'confidence >= minConfidence', pass: sampleScore.confidence >= config.threshold.minConfidence, actual: sampleScore.confidence, threshold: config.threshold.minConfidence },
    { name: 'max >= minTopScore', pass: sampleScore.scoreStats.max >= config.threshold.minTopScore, actual: sampleScore.scoreStats.max, threshold: config.threshold.minTopScore },
    { name: 'mean >= minMeanScore', pass: sampleScore.scoreStats.mean >= config.threshold.minMeanScore, actual: sampleScore.scoreStats.mean, threshold: config.threshold.minMeanScore },
    { name: 'stdDev <= maxStdDev', pass: sampleScore.scoreStats.stdDev <= config.threshold.maxStdDev, actual: sampleScore.scoreStats.stdDev, threshold: config.threshold.maxStdDev },
    { name: 'count >= minResultCount', pass: sampleScore.scoreStats.count >= config.threshold.minResultCount, actual: sampleScore.scoreStats.count, threshold: config.threshold.minResultCount }
  ];

  checks.forEach(check => {
    const status = check.pass ? '✅' : '❌';
    console.log(`${status} ${check.name}: ${check.actual} vs ${check.threshold} = ${check.pass}`);
  });

  const allPass = checks.every(check => check.pass);
  console.log(`\n🔍 Overall decision: ${allPass ? 'ANSWERABLE' : 'NOT_ANSWERABLE'}`);
  console.log(`🎯 Expected with threshold 0.01: ANSWERABLE`);
}

// Set environment variable for testing
process.env.ANSWERABILITY_THRESHOLD = '0.01';

debugThresholdConfig().catch(console.error);