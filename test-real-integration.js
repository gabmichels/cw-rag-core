/**
 * Real integration test for OpenAI LLM synthesis
 * Tests the actual implementation with real API calls
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const API_BASE_URL = 'http://localhost:3000';
const TEST_PAYLOAD = {
  "query": "What is zenithfall and how does it work?",
  "userContext": {
    "id": "test-user-123",
    "tenantId": "zenithfall",
    "groupIds": ["admin"],
    "language": "en"
  },
  "k": 5,
  "synthesis": {
    "includeCitations": true,
    "answerFormat": "markdown",
    "maxContextLength": 4000
  },
  "includeMetrics": true,
  "includeDebugInfo": true
};

async function testOpenAIIntegration() {
  console.log('🚀 Testing Real OpenAI LLM Integration...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing API health...');
    const healthResponse = await fetch(`${API_BASE_URL}/healthz`);
    if (healthResponse.ok) {
      console.log('✅ API server is running');
    } else {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }

    // Test 2: Real /ask request
    console.log('\n2. Testing /ask endpoint with real OpenAI integration...');
    console.log(`Query: "${TEST_PAYLOAD.query}"`);

    const startTime = Date.now();
    const response = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_PAYLOAD)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();

    // Test 3: Validate response structure
    console.log('\n3. Validating response structure...');

    const requiredFields = ['answer', 'retrievedDocuments', 'queryId', 'guardrailDecision'];
    const missingFields = requiredFields.filter(field => !(field in result));

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    console.log('✅ Response structure is valid');

    // Test 4: Check guardrail decision
    console.log('\n4. Checking answerability guardrail...');
    console.log(`Answerable: ${result.guardrailDecision.isAnswerable}`);
    console.log(`Confidence: ${result.guardrailDecision.confidence}`);

    if (result.guardrailDecision.isAnswerable) {
      console.log('✅ Guardrail allowed LLM synthesis');
    } else {
      console.log('⚠️  Guardrail blocked synthesis (IDK response)');
    }

    // Test 5: Check LLM response
    console.log('\n5. Checking LLM synthesis result...');
    console.log(`Answer length: ${result.answer.length} characters`);
    console.log(`Citations: ${result.citations ? result.citations.length : 0}`);

    if (result.synthesisMetadata) {
      console.log(`Model used: ${result.synthesisMetadata.modelUsed}`);
      console.log(`Tokens used: ${result.synthesisMetadata.tokensUsed}`);
      console.log(`LLM Provider: ${result.synthesisMetadata.llmProvider || 'Not specified'}`);
    }

    // Test 6: Performance metrics
    if (result.metrics) {
      console.log('\n6. Performance metrics:');
      console.log(`Total duration: ${result.metrics.totalDuration}ms`);
      console.log(`Synthesis time: ${result.metrics.synthesisTime}ms`);
      console.log(`Response time: ${responseTime}ms`);
    }

    // Test 7: Sample answer content
    console.log('\n7. Sample answer preview:');
    const answerPreview = result.answer.substring(0, 200) + (result.answer.length > 200 ? '...' : '');
    console.log(`"${answerPreview}"`);

    console.log('\n🎉 SUCCESS: Real OpenAI integration test passed!');
    console.log('\n📊 Test Results Summary:');
    console.log(`- API Health: ✅ OK`);
    console.log(`- Response Time: ${responseTime}ms`);
    console.log(`- Guardrail Decision: ${result.guardrailDecision.isAnswerable ? 'ANSWERABLE' : 'IDK'}`);
    console.log(`- Answer Generated: ${result.answer.length > 0 ? 'YES' : 'NO'}`);
    console.log(`- Citations: ${result.citations ? result.citations.length : 0}`);
    console.log(`- Model: ${result.synthesisMetadata?.modelUsed || 'Unknown'}`);

    return true;

  } catch (error) {
    console.error('\n❌ FAILED: Real integration test failed');
    console.error('Error:', error.message);

    if (error.message.includes('Failed to fetch') || error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Tip: Make sure the API server is running on http://localhost:3000');
      console.error('   Run: cd apps/api && npm run dev');
    }

    if (error.message.includes('401') || error.message.includes('API key')) {
      console.error('\n💡 Tip: Check that OPENAI_API_KEY is set in .env file');
    }

    return false;
  }
}

// Run the test
testOpenAIIntegration().then(success => {
  process.exit(success ? 0 : 1);
});