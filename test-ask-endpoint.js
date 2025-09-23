// Simple test script to verify /ask endpoint functionality
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function testAskEndpoint() {
  console.log('Testing /ask endpoint...');

  const payload = {
    query: "What can you tell me about Core Combat Rules?",
    userContext: {
      id: "anonymous",
      tenantId: "zenithfall",
      groupIds: ["public"]
    },
    k: 10
  };

  try {
    console.log('Sending request to:', `${API_BASE}/ask`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('Success! Response received:');
    console.log('- Answer length:', result.answer?.length || 0);
    console.log('- Retrieved documents:', result.retrievedDocuments?.length || 0);
    console.log('- Query ID:', result.queryId);
    console.log('- Guardrail decision:', result.guardrailDecision?.isAnswerable);

    if (result.citations) {
      console.log('- Citations:', result.citations.length);
    }

    if (result.metrics) {
      console.log('- Total duration:', result.metrics.totalDuration, 'ms');
    }

    return result;
  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

// Test with docId parameter
async function testAskWithDocId() {
  console.log('\nTesting /ask endpoint with docId...');

  const payload = {
    query: "What can you tell me about Core Combat Rules?",
    userContext: {
      id: "anonymous",
      tenantId: "zenithfall",
      groupIds: ["public"]
    },
    k: 10,
    docId: "test-document-id"
  };

  try {
    console.log('Sending request with docId to:', `${API_BASE}/ask`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('Success! Response with docId received:');
    console.log('- Answer length:', result.answer?.length || 0);
    console.log('- Retrieved documents:', result.retrievedDocuments?.length || 0);
    console.log('- Query ID:', result.queryId);

    return result;
  } catch (error) {
    console.error('Test with docId failed:', error.message);
    throw error;
  }
}

// Run tests
async function runTests() {
  try {
    console.log('='.repeat(50));
    console.log('TESTING /ASK ENDPOINT');
    console.log('='.repeat(50));

    // Test basic functionality
    await testAskEndpoint();

    // Test with docId parameter
    await testAskWithDocId();

    console.log('\n' + '='.repeat(50));
    console.log('ALL TESTS PASSED! ✅');
    console.log('='.repeat(50));
  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.log('TEST FAILED! ❌');
    console.log('Error:', error.message);
    console.log('='.repeat(50));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { testAskEndpoint, testAskWithDocId };