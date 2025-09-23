/**
 * Simple test to verify LLM response contains real content
 */

const TEST_QUERY = 'What are the rules for Off-Hand Combat (Dual Wielding)?';
const API_URL = 'http://localhost:3000';

async function testLLMResponse() {
  console.log('🧪 TESTING LLM RESPONSE CONTENT');
  console.log('================================');
  console.log(`Query: "${TEST_QUERY}"`);
  console.log('');

  try {
    const payload = {
      query: TEST_QUERY,
      userContext: {
        id: 'test-user',
        tenantId: 'zenithfall',
        groupIds: ['public']
      },
      k: 10,
      includeMetrics: true,
      includeDebugInfo: false
    };

    console.log('📤 Sending request to /ask endpoint...');
    const response = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log('✅ Response received!');
    console.log('');
    console.log('📊 RESPONSE ANALYSIS:');
    console.log(`Answer length: ${result.answer?.length || 0} characters`);
    console.log(`Guardrail answerable: ${result.guardrailDecision?.isAnswerable}`);
    console.log(`Confidence: ${result.guardrailDecision?.confidence?.toFixed(3) || 'N/A'}`);
    console.log(`Retrieved documents: ${result.retrievedDocuments?.length || 0}`);
    console.log('');

    console.log('📝 FULL LLM RESPONSE:');
    console.log('=' .repeat(80));
    console.log(result.answer || 'No answer received');
    console.log('=' .repeat(80));
    console.log('');

    // Check for specific content from the rules
    const expectedContent = [
      'Requires Dual Wield unlocks',
      'Attack action',
      'Main Hand',
      'Off-Hand',
      'Weapon Die only',
      'full damage package',
      'Light weapons',
      'Medium weapons',
      'Heavy weapons',
      'no Bonus Action cost',
      'Momentum chains'
    ];

    console.log('🔍 CONTENT VERIFICATION:');
    let foundCount = 0;
    expectedContent.forEach(content => {
      const found = result.answer?.includes(content) || false;
      console.log(`${found ? '✅' : '❌'} "${content}": ${found ? 'FOUND' : 'NOT FOUND'}`);
      if (found) foundCount++;
    });

    console.log('');
    console.log(`📈 CONTENT MATCH: ${foundCount}/${expectedContent.length} (${((foundCount/expectedContent.length)*100).toFixed(1)}%)`);

    if (foundCount >= expectedContent.length * 0.7) {
      console.log('🎉 SUCCESS: LLM response contains substantial real content from the rules!');
    } else {
      console.log('⚠️  WARNING: LLM response may not contain enough real content');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testLLMResponse().catch(console.error);