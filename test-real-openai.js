import { LLMClientImpl } from './apps/api/src/services/llm-client.js';
import { config } from 'dotenv';

// Load environment variables
config();

async function testOpenAIIntegration() {
  console.log('Testing OpenAI LLM Integration...\n');

  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not configured in environment');
    process.exit(1);
  }

  console.log('✅ OpenAI API key found');

  // Test OpenAI configuration
  const openaiConfig = {
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.1,
    maxTokens: 500,
    apiKey: process.env.OPENAI_API_KEY
  };

  console.log(`✅ Testing with model: ${openaiConfig.model}`);

  try {
    // Create LLM client
    const client = new LLMClientImpl(openaiConfig);
    console.log('✅ LLM client created successfully');

    // Test basic configuration
    const config = client.getConfig();
    console.log(`✅ Provider: ${config.provider}, Model: ${config.model}`);
    console.log(`✅ Supports streaming: ${client.supportsStreaming()}`);

    // Test completion
    console.log('\n🧪 Testing completion generation...');
    const context = `
Document 1: The company's Q3 2023 revenue was $125.3 million, representing a 15% increase from the previous quarter.
Document 2: Our AI security protocols include end-to-end encryption and regular vulnerability assessments.
`;

    const query = 'What was the company revenue in Q3 2023?';

    console.log(`Query: ${query}`);
    console.log('Calling OpenAI API...');

    const result = await client.generateCompletion(query, context);

    console.log('\n📝 OpenAI Response:');
    console.log(`Text: ${result.text}`);
    console.log(`Tokens Used: ${result.tokensUsed}`);
    console.log(`Model: ${result.model}`);

    // Verify response contains citations
    if (result.text.includes('[^') && result.text.includes('125.3 million')) {
      console.log('✅ Response contains proper citations and expected content');
    } else {
      console.log('⚠️  Response may not contain proper citations or expected content');
    }

    // Test streaming completion
    console.log('\n🧪 Testing streaming completion...');
    let streamedText = '';
    let chunkCount = 0;

    for await (const chunk of client.generateStreamingCompletion(query, context)) {
      chunkCount++;
      if (chunk.type === 'chunk') {
        streamedText += chunk.data;
        process.stdout.write('.');
      } else if (chunk.type === 'done') {
        console.log('\n✅ Streaming completed');
        break;
      } else if (chunk.type === 'error') {
        console.log('\n❌ Streaming error:', chunk.data);
        break;
      }
    }

    console.log(`✅ Received ${chunkCount} chunks`);
    console.log(`✅ Streamed text length: ${streamedText.length}`);

    console.log('\n🎉 OpenAI integration test PASSED!');

  } catch (error) {
    console.error('\n❌ OpenAI integration test FAILED:');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Test vLLM integration if configured
async function testVLLMIntegration() {
  if (!process.env.LLM_ENDPOINT || process.env.LLM_PROVIDER !== 'vllm') {
    console.log('⏭️  Skipping vLLM test (not configured)');
    return;
  }

  console.log('\n🧪 Testing vLLM Integration...');

  const vllmConfig = {
    provider: 'vllm',
    model: process.env.LLM_MODEL || 'Llama-3.1-8B-Instruct',
    baseURL: process.env.LLM_ENDPOINT,
    temperature: 0.1,
    maxTokens: 500,
    streaming: true,
    timeoutMs: 25000
  };

  try {
    const client = new LLMClientImpl(vllmConfig);
    console.log('✅ vLLM client created successfully');

    const context = `Document: AI security requires proper authentication and encryption.`;
    const query = 'What does AI security require?';

    console.log('Calling vLLM API...');
    const result = await client.generateCompletion(query, context);

    console.log('\n📝 vLLM Response:');
    console.log(`Text: ${result.text}`);
    console.log(`Tokens Used: ${result.tokensUsed}`);
    console.log(`Model: ${result.model}`);

    console.log('\n🎉 vLLM integration test PASSED!');

  } catch (error) {
    console.error('\n❌ vLLM integration test FAILED:');
    console.error('Error:', error.message);
  }
}

async function main() {
  try {
    await testOpenAIIntegration();
    await testVLLMIntegration();
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();