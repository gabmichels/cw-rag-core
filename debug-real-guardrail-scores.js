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

    console.log('\n--- RAW API RESPONSE START ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('--- RAW API RESPONSE END ---');

    console.log('\n📊 GUARDRAIL DECISION:');
    console.log('isAnswerable:', result.guardrailDecision?.isAnswerable);
    console.log('confidence:', result.guardrailDecision?.confidence);
    console.log('reasonCode:', result.guardrailDecision?.idkResponse?.reasonCode);
    console.log('threshold:', result.guardrailDecision?.threshold);
    console.log('sourceAwareConfidence (final):', result.guardrailDecision?.score?.sourceAwareConfidence?.finalConfidence); // Log final confidence

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

    if (result.guardrailDecision?.score?.sourceAwareConfidence) {
      console.log('\n--- Source-Aware Confidence Details ---');
      console.log(JSON.stringify(result.guardrailDecision.score.sourceAwareConfidence, null, 2));
      console.log('--- END Source-Aware Confidence Details ---');
    }

    // Check threshold logic manually, using guardrailDecision.confidence
    if (result.guardrailDecision?.threshold && result.guardrailDecision?.scoreStats && result.guardrailDecision?.confidence !== undefined) {
      console.log('\n🎯 THRESHOLD CHECKS:');
      const gd = result.guardrailDecision; // Use short alias for guardrailDecision
      const threshold = gd.threshold;

      const checks = [
        { name: 'confidence >= minConfidence', pass: gd.confidence >= threshold.minConfidence, actual: gd.confidence, expected: threshold.minConfidence },
        { name: 'max >= minTopScore', pass: gd.scoreStats.max >= threshold.minTopScore, actual: gd.scoreStats.max, expected: threshold.minTopScore },
        { name: 'mean >= minMeanScore', pass: gd.scoreStats.mean >= threshold.minMeanScore, actual: gd.scoreStats.mean, expected: threshold.minMeanScore },
        { name: 'stdDev <= maxStdDev', pass: gd.scoreStats.stdDev <= threshold.maxStdDev, actual: gd.scoreStats.stdDev, expected: threshold.maxStdDev },
        { name: 'count >= minResultCount', pass: gd.scoreStats.count >= threshold.minResultCount, actual: gd.scoreStats.count, expected: threshold.minResultCount }
      ];

      checks.forEach(check => {
        const status = check.pass ? '✅' : '❌';
        console.log(`${status} ${check.name}: ${check.actual} vs ${check.expected} = ${check.pass}`);
      });

      const allPass = checks.every(check => check.pass);
      console.log(`\n🔍 Expected decision (based on checks): ${allPass ? 'ANSWERABLE' : 'NOT_ANSWERABLE'}`);
      console.log(`🔍 Actual decision (from API): ${gd.isAnswerable ? 'ANSWERABLE' : 'NOT_ANSWERABLE'}`);

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