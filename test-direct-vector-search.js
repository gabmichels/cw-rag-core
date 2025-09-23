/**
 * Test Direct Vector Search - Bypass guardrails to test raw vector quality
 */

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';
const EMBEDDING_SERVICE_URL = 'http://localhost:8080/embed';
const TARGET_POINT_ID = 'a3d5597a-1d56-b174-03e0-fc7f2722b64e';
const TEST_QUERY = 'What are the rules for Off-Hand Combat (Dual Wielding)?';

async function getEmbedding(text) {
  const response = await fetch(EMBEDDING_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: [text] })
  });
  const embeddings = await response.json();
  return embeddings[0];
}

function l2Normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector.map(() => 0);
  return vector.map(v => v / norm);
}

async function searchWithFilter(vector, limit = 10, filter = null) {
  const body = {
    vector: vector,
    limit: limit,
    with_payload: true,
    with_vector: false
  };

  if (filter) {
    body.filter = filter;
  }

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  return result.result;
}

async function testDirectVectorSearch() {
  console.log('🔍 TESTING DIRECT VECTOR SEARCH');
  console.log('===============================');
  console.log(`Query: "${TEST_QUERY}"`);
  console.log(`Target Point ID: ${TARGET_POINT_ID}`);

  try {
    console.log('\n🔄 Step 1: Generate query embedding...');
    const queryEmbedding = await getEmbedding(TEST_QUERY);
    const normalizedQuery = l2Normalize(queryEmbedding);

    console.log(`✅ Query embedding generated: ${queryEmbedding.length} dimensions`);
    console.log(`   First 5 values: [${normalizedQuery.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

    console.log('\n🔄 Step 2: Test vector search WITHOUT filters...');
    const unfilteredResults = await searchWithFilter(normalizedQuery, 10);

    console.log(`✅ Unfiltered search returned ${unfilteredResults.length} results`);

    let targetFoundUnfiltered = false;
    let targetRankUnfiltered = -1;

    unfilteredResults.forEach((result, i) => {
      const isTarget = result.id === TARGET_POINT_ID;
      const contentPreview = (result.payload.content || '').substring(0, 60);
      const marker = isTarget ? '🎯' : '  ';

      if (isTarget) {
        targetFoundUnfiltered = true;
        targetRankUnfiltered = i + 1;
      }

      console.log(`   ${marker} Rank ${i + 1}: Score ${result.score.toFixed(6)} - "${contentPreview}..."`);
      console.log(`      Tenant: ${result.payload.tenant}, ACL: ${JSON.stringify(result.payload.acl)}`);
    });

    console.log('\n🔄 Step 3: Test vector search WITH RBAC filters...');

    // Test with the same RBAC filter as the production system
    const rbacFilter = {
      must: [
        { key: 'tenant', match: { value: 'zenithfall' } },
        {
          should: [
            { key: 'acl', match: { value: 'anonymous' } },
            { key: 'acl', match: { value: 'public' } }
          ]
        }
      ]
    };

    const filteredResults = await searchWithFilter(normalizedQuery, 10, rbacFilter);

    console.log(`✅ RBAC filtered search returned ${filteredResults.length} results`);

    let targetFoundFiltered = false;
    let targetRankFiltered = -1;

    filteredResults.forEach((result, i) => {
      const isTarget = result.id === TARGET_POINT_ID;
      const contentPreview = (result.payload.content || '').substring(0, 60);
      const marker = isTarget ? '🎯' : '  ';

      if (isTarget) {
        targetFoundFiltered = true;
        targetRankFiltered = i + 1;
      }

      console.log(`   ${marker} Rank ${i + 1}: Score ${result.score.toFixed(6)} - "${contentPreview}..."`);
    });

    console.log('\n🔄 Step 4: Test with different filters...');

    // Test with simpler filter
    const simpleFilter = {
      must: [
        { key: 'tenant', match: { value: 'zenithfall' } }
      ]
    };

    const simpleResults = await searchWithFilter(normalizedQuery, 10, simpleFilter);
    console.log(`✅ Simple tenant filter returned ${simpleResults.length} results`);

    console.log('\n📊 ANALYSIS SUMMARY');
    console.log('==================');

    console.log(`Unfiltered search: ${targetFoundUnfiltered ? `Target at rank ${targetRankUnfiltered}` : 'Target NOT FOUND'}`);
    console.log(`RBAC filtered search: ${targetFoundFiltered ? `Target at rank ${targetRankFiltered}` : 'Target NOT FOUND'}`);
    console.log(`Simple filtered search: ${simpleResults.length} total results`);

    if (targetFoundUnfiltered && !targetFoundFiltered) {
      console.log('\n🔥 RBAC FILTER ISSUE DETECTED!');
      console.log('   The target document is found without filters but not with RBAC filters');
      console.log('   This suggests an RBAC configuration problem');

      // Check target document's ACL
      const targetPoint = unfilteredResults.find(r => r.id === TARGET_POINT_ID);
      if (targetPoint) {
        console.log(`   Target document ACL: ${JSON.stringify(targetPoint.payload.acl)}`);
        console.log(`   Target document tenant: ${targetPoint.payload.tenant}`);
      }
    } else if (targetFoundUnfiltered && targetFoundFiltered) {
      console.log('\n✅ VECTOR SEARCH IS WORKING!');
      console.log('   Target found both with and without filters');
      console.log('   The issue must be in the guardrail logic');
    } else if (!targetFoundUnfiltered) {
      console.log('\n🔥 VECTOR SEARCH QUALITY ISSUE!');
      console.log('   Target not found even without filters');
      console.log('   This suggests the embeddings or vector search are still not working correctly');
    }

    console.log('\n💡 NEXT STEPS:');
    if (targetFoundUnfiltered && !targetFoundFiltered) {
      console.log('   🔧 Fix RBAC filter configuration');
      console.log('   🔧 Check ACL values in uploaded documents');
    } else if (targetFoundUnfiltered && targetFoundFiltered) {
      console.log('   🔧 Check guardrail threshold settings');
      console.log('   🔧 Test vector-only mode without guardrails');
    } else {
      console.log('   🔧 Investigate vector embedding quality');
      console.log('   🔧 Check if document content changed during upload');
    }

  } catch (error) {
    console.error('❌ Direct vector search test failed:', error.message);
  }
}

// Run the test
testDirectVectorSearch().catch(console.error);