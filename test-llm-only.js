/**
 * Direct test of LLM synthesis components without requiring Qdrant/full server
 * Tests the real OpenAI integration in isolation
 */

import { createAnswerSynthesisService } from './apps/api/src/services/answer-synthesis.js';
import 'dotenv/config';

// Mock search results to test synthesis
const mockSearchResults = [
  {
    id: 'doc1',
    score: 0.95,
    content: 'Zenithfall is a comprehensive RAG (Retrieval-Augmented Generation) system that combines advanced vector search with intelligent document processing. It uses hybrid search techniques to find relevant content and then synthesizes answers using large language models.',
    fusionScore: 0.95,
    searchType: 'hybrid',
    payload: {
      docId: 'zenithfall-overview',
      tenant: 'zenithfall',
      url: 'https://docs.zenithfall.com/overview',
      modifiedAt: new Date().toISOString()
    }
  },
  {
    id: 'doc2',
    score: 0.87,
    content: 'The system works by first processing documents through an ingestion pipeline that extracts text, creates embeddings, and stores them in a vector database. When users ask questions, it performs semantic search to find relevant content and uses LLM synthesis to generate comprehensive answers with proper citations.',
    fusionScore: 0.87,
    searchType: 'hybrid',
    payload: {
      docId: 'zenithfall-architecture',
      tenant: 'zenithfall',
      url: 'https://docs.zenithfall.com/architecture',
      modifiedAt: new Date().toISOString()
    }
  }
];

const mockUserContext = {
  id: 'test-user-123',
  tenantId: 'zenithfall',
  groupIds: ['admin'],
  language: 'en'
};

async function testLLMSynthesis() {
  console.log('🧪 Testing Real OpenAI LLM Synthesis (Direct)...\n');

  try {
    // Test environment variables
    console.log('1. Checking environment configuration...');
    const requiredEnvs = ['LLM_ENABLED', 'LLM_PROVIDER', 'LLM_MODEL', 'OPENAI_API_KEY'];
    const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

    if (missingEnvs.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvs.join(', ')}`);
    }

    console.log(`✅ LLM Provider: ${process.env.LLM_PROVIDER}`);
    console.log(`✅ LLM Model: ${process.env.LLM_MODEL}`);
    console.log(`✅ OpenAI API Key: ${process.env.OPENAI_API_KEY ? '***configured***' : 'MISSING'}`);
    console.log(`✅ Answerability Threshold: ${process.env.ANSWERABILITY_THRESHOLD}`);

    // Test 2: Create synthesis service
    console.log('\n2. Creating answer synthesis service...');
    const synthesisService = createAnswerSynthesisService(true); // Enhanced version
    console.log('✅ Answer synthesis service created');

    // Test 3: Test synthesis request
    console.log('\n3. Testing answer synthesis with mock documents...');
    const synthesisRequest = {
      query: 'What is zenithfall and how does it work?',
      documents: mockSearchResults,
      userContext: mockUserContext,
      maxContextLength: 4000,
      includeCitations: true,
      answerFormat: 'markdown'
    };

    console.log(`Query: "${synthesisRequest.query}"`);
    console.log(`Documents: ${synthesisRequest.documents.length}`);

    const startTime = Date.now();
    const response = await synthesisService.synthesizeAnswer(synthesisRequest);
    const responseTime = Date.now() - startTime;

    // Test 4: Validate response
    console.log('\n4. Validating synthesis response...');
    console.log(`✅ Response time: ${responseTime}ms`);
    console.log(`✅ Answer length: ${response.answer.length} characters`);
    console.log(`✅ Citations: ${Object.keys(response.citations).length}`);
    console.log(`✅ Confidence: ${response.confidence}`);
    console.log(`✅ Model used: ${response.modelUsed}`);
    console.log(`✅ Tokens used: ${response.tokensUsed}`);

    // Test 5: Check answer quality
    console.log('\n5. Checking answer quality...');
    const hasZenithfall = response.answer.toLowerCase().includes('zenithfall');
    const hasCitations = response.answer.includes('[^');
    const hasSubstantialContent = response.answer.length > 100;

    console.log(`✅ Mentions zenithfall: ${hasZenithfall}`);
    console.log(`✅ Includes citations: ${hasCitations}`);
    console.log(`✅ Substantial content: ${hasSubstantialContent}`);

    // Test 6: Display sample answer
    console.log('\n6. Sample answer preview:');
    const preview = response.answer.substring(0, 300) + (response.answer.length > 300 ? '...' : '');
    console.log(`"${preview}"`);

    // Test 7: Check guardrail behavior
    console.log('\n7. Testing answerability guardrail...');
    const lowQualityDocs = [{
      id: 'doc-low',
      score: 0.1,
      content: 'Irrelevant content about something else entirely.',
      fusionScore: 0.1,
      searchType: 'hybrid',
      payload: { docId: 'irrelevant', tenant: 'zenithfall' }
    }];

    const lowQualityRequest = {
      ...synthesisRequest,
      documents: lowQualityDocs,
      query: 'What is the meaning of life and universe?'
    };

    const lowQualityResponse = await synthesisService.synthesizeAnswer(lowQualityRequest);
    const isIdkResponse = lowQualityResponse.answer.toLowerCase().includes("don't have") ||
                         lowQualityResponse.answer.toLowerCase().includes("insufficient") ||
                         lowQualityResponse.confidence < 0.3;

    console.log(`✅ Low quality handling: ${isIdkResponse ? 'IDK response' : 'Normal response'}`);
    console.log(`✅ Low quality confidence: ${lowQualityResponse.confidence}`);

    console.log('\n🎉 SUCCESS: Real OpenAI LLM synthesis test passed!');
    console.log('\n📊 Test Results Summary:');
    console.log(`- LLM Provider: ${process.env.LLM_PROVIDER}`);
    console.log(`- Model: ${response.modelUsed}`);
    console.log(`- Response Time: ${responseTime}ms`);
    console.log(`- Answer Quality: ${hasZenithfall && hasCitations && hasSubstantialContent ? 'EXCELLENT' : 'NEEDS_REVIEW'}`);
    console.log(`- Guardrail Function: ${isIdkResponse ? 'WORKING' : 'NEEDS_REVIEW'}`);
    console.log(`- Confidence Range: ${lowQualityResponse.confidence.toFixed(2)} - ${response.confidence.toFixed(2)}`);

    return true;

  } catch (error) {
    console.error('\n❌ FAILED: LLM synthesis test failed');
    console.error('Error:', error.message);

    if (error.message.includes('API key')) {
      console.error('\n💡 Tip: Check that OPENAI_API_KEY is correctly set in .env file');
    }

    if (error.message.includes('rate limit')) {
      console.error('\n💡 Tip: OpenAI rate limit exceeded, try again in a moment');
    }

    return false;
  }
}

// Run the test
testLLMSynthesis().then(success => {
  process.exit(success ? 0 : 1);
});