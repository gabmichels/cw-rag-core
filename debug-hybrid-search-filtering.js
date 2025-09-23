// Debug script to test hybrid search and see where results are filtered out
const { createHybridSearchService } = require('./packages/retrieval/dist/services/hybrid-search.js');
const { QdrantKeywordSearchService } = require('./packages/retrieval/dist/services/keyword-search.js');
const { ReciprocalRankFusionService } = require('./packages/retrieval/dist/services/rrf-fusion.js');

// Mock embedding service
const embeddingService = {
  async embed(text) {
    console.log(`🔍 Generating embedding for: "${text}"`);
    // Use a dummy embedding - in real code this would call OpenAI
    return new Array(384).fill(0).map(() => Math.random() * 0.1 - 0.05);
  }
};

// Mock vector search service that logs results
class DebugVectorSearchService {
  async search(collectionName, params) {
    console.log('🎯 Vector search called with:');
    console.log('  Collection:', collectionName);
    console.log('  Limit:', params.limit);
    console.log('  Filter:', JSON.stringify(params.filter, null, 2));

    // Mock some results that match our test case
    const results = [
      {
        id: 'a3d5597a-1d56-b174-03e0-fc7f2722b64e',
        score: 0.885,
        content: '## 🗡 Off-Hand Combat (Dual Wielding)\n\n[OFF-HAND] **Requires dual-wield weapons** (shortswords, rapiers, hand axes)',
        payload: {
          tenant: 'zenithfall',        // Note: this is 'tenant' not 'tenantId'
          tenantId: 'zenithfall',      // Also include correct field
          docId: 'combat-rules',
          acl: ['public'],
          lang: 'en',
          url: 'https://example.com/combat',
          version: '1.0'
        }
      },
      {
        id: 'test-doc-2',
        score: 0.75,
        content: 'Some other combat rule',
        payload: {
          tenant: 'zenithfall',
          tenantId: 'zenithfall',
          docId: 'other-rules',
          acl: ['public'],
          lang: 'en'
        }
      }
    ];

    console.log(`✅ Vector search returning ${results.length} results`);
    results.forEach((result, i) => {
      console.log(`   ${i+1}. ID: ${result.id}, Score: ${result.score}`);
      console.log(`      Tenant: ${result.payload.tenant}, ACL: ${JSON.stringify(result.payload.acl)}`);
    });

    return results;
  }
}

// Mock keyword search service
class DebugKeywordSearchService {
  async search(collectionName, query, limit, filter) {
    console.log('🔍 Keyword search called with:');
    console.log('  Query:', query);
    console.log('  Limit:', limit);
    console.log('  Filter:', JSON.stringify(filter, null, 2));

    const results = [
      {
        id: 'keyword-result-1',
        score: 0.6,
        content: 'Dual wielding combat mechanics',
        payload: {
          tenant: 'zenithfall',
          tenantId: 'zenithfall',
          docId: 'combat-guide',
          acl: ['public'],
          lang: 'en'
        }
      }
    ];

    console.log(`✅ Keyword search returning ${results.length} results`);
    return results;
  }
}

async function debugHybridSearchFiltering() {
  console.log('🔍 DEBUGGING HYBRID SEARCH FILTERING');
  console.log('=====================================');

  // Create services
  const vectorSearchService = new DebugVectorSearchService();
  const keywordSearchService = new DebugKeywordSearchService();
  const rrfFusionService = new ReciprocalRankFusionService();

  const hybridSearchService = createHybridSearchService(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    embeddingService
  );

  // Test request matching our test case
  const request = {
    query: "What are the rules for Off-Hand Combat (Dual Wielding)?",
    limit: 10,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    rrfK: 60,
    enableKeywordSearch: true,
    tenantId: 'zenithfall'
  };

  const userContext = {
    id: "test-user-123",
    groupIds: ["zenithfall"],
    tenantId: "zenithfall"
  };

  console.log('\n📝 Test Parameters:');
  console.log('Query:', request.query);
  console.log('User Context:', userContext);

  try {
    console.log('\n🚀 Executing hybrid search...');
    const result = await hybridSearchService.search('zenithfall', request, userContext);

    console.log('\n📊 FINAL RESULTS:');
    console.log('Results count:', result.results.length);
    console.log('Metrics:', result.metrics);

    if (result.results.length > 0) {
      console.log('\n📋 Final results details:');
      result.results.forEach((res, i) => {
        console.log(`${i+1}. ID: ${res.id}`);
        console.log(`   Score: ${res.score}`);
        console.log(`   Content preview: ${res.content?.substring(0, 50)}...`);
        console.log(`   Payload tenant: ${res.payload?.tenant}`);
        console.log(`   Payload tenantId: ${res.payload?.tenantId}`);
        console.log(`   Payload ACL: ${JSON.stringify(res.payload?.acl)}`);
      });
    } else {
      console.log('❌ NO RESULTS RETURNED - Something filtered them out!');
    }

  } catch (error) {
    console.error('❌ Hybrid search failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugHybridSearchFiltering().catch(console.error);