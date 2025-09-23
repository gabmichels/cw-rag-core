// Debug script to capture actual guardrail scores from /ask endpoint
const http = require('http');

async function debugRealGuardrailScores() {
  const requestPayload = {
    query: "What are the rules for Off-Hand Combat (Dual Wielding)?",
    userContext: {
      id: "test-user-123",
      groupIds: ["zenithfall"],
      tenantId: "zenithfall"
    },
    k: 10,
    includeMetrics: true,
    includeDebugInfo: true
  };

  console.log('🔍 Testing /ask endpoint with debug info...');
  console.log('Query:', requestPayload.query);
  console.log('Expected threshold: 0.01');

  try {
    const result = await makeRequest('localhost', 3000, '/ask', requestPayload);

    console.log('\n📊 GUARDRAIL DECISION:');
    console.log('isAnswerable:', result.guardrailDecision?.isAnswerable);
    console.log('confidence:', result.guardrailDecision?.confidence);
    console.log('reasonCode:', result.guardrailDecision?.reasonCode);
    console.log('threshold:', result.guardrailDecision?.threshold);

    if (result.guardrailDecision?.scoreStats) {
      console.log('\n📈 SCORE STATISTICS:');
      const stats = result.guardrailDecision.scoreStats;
      console.log('mean:', stats.mean);
      console.log('max:', stats.max);
      console.log('min:', stats.min);
      console.log('stdDev:', stats.stdDev);
      console.log('count:', stats.count);
    }

    if (result.guardrailDecision?.algorithmScores) {
      console.log('\n🧮 ALGORITHM SCORES:');
      const alg = result.guardrailDecision.algorithmScores;
      console.log('statistical:', alg.statistical);
      console.log('threshold:', alg.threshold);
      console.log('mlFeatures:', alg.mlFeatures);
      console.log('rerankerConfidence:', alg.rerankerConfidence);
    }

    // Check threshold logic manually
    if (result.guardrailDecision?.threshold && result.guardrailDecision?.scoreStats) {
      console.log('\n🎯 THRESHOLD CHECKS:');
      const score = result.guardrailDecision;
      const threshold = score.threshold;

      const checks = [
        { name: 'confidence >= minConfidence', pass: score.confidence >= threshold.minConfidence, actual: score.confidence, expected: threshold.minConfidence },
        { name: 'max >= minTopScore', pass: score.scoreStats.max >= threshold.minTopScore, actual: score.scoreStats.max, expected: threshold.minTopScore },
        { name: 'mean >= minMeanScore', pass: score.scoreStats.mean >= threshold.minMeanScore, actual: score.scoreStats.mean, expected: threshold.minMeanScore },
        { name: 'stdDev <= maxStdDev', pass: score.scoreStats.stdDev <= threshold.maxStdDev, actual: score.scoreStats.stdDev, expected: threshold.maxStdDev },
        { name: 'count >= minResultCount', pass: score.scoreStats.count >= threshold.minResultCount, actual: score.scoreStats.count, expected: threshold.minResultCount }
      ];

      checks.forEach(check => {
        const status = check.pass ? '✅' : '❌';
        console.log(`${status} ${check.name}: ${check.actual} vs ${check.expected} = ${check.pass}`);
      });

      const allPass = checks.every(check => check.pass);
      console.log(`\n🔍 Expected decision: ${allPass ? 'ANSWERABLE' : 'NOT_ANSWERABLE'}`);
      console.log(`🔍 Actual decision: ${score.isAnswerable ? 'ANSWERABLE' : 'NOT_ANSWERABLE'}`);

      const failedChecks = checks.filter(check => !check.pass);
      if (failedChecks.length > 0) {
        console.log('\n❌ FAILED CHECKS:');
        failedChecks.forEach(check => {
          console.log(`   - ${check.name}: ${check.actual} vs ${check.expected}`);
        });
      }
    }

    console.log('\n📋 DOCUMENTS RETURNED:', result.retrievedDocuments?.length || 0);

    if (result.metrics) {
      console.log('\n⏱️  METRICS:');
      console.log('Total duration:', result.metrics.totalDuration, 'ms');
      console.log('Guardrail duration:', result.metrics.guardrailDuration, 'ms');
      console.log('Vector results:', result.metrics.vectorResultCount);
      console.log('Final results:', result.metrics.finalResultCount);
    }

  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

function makeRequest(host, port, path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(30000);
    req.write(postData);
    req.end();
  });
}

debugRealGuardrailScores().catch(console.error);