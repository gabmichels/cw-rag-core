/**
 * Vector Search Quality Diagnostic Tool
 * Tests embedding quality and direct similarity between query and target content
 */

// Using built-in fetch (Node.js 18+)

const EMBEDDING_SERVICE_URL = 'http://localhost:8080/embed';
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';
const TARGET_POINT_ID = 'a3d5597a-1d56-b174-03e0-fc7f2722b64e';

// Test query
const query = 'What are the rules for Off-Hand Combat (Dual Wielding)?';

// Expected target content (based on problem description)
const expectedTargetContent = '## 🗡 Off-Hand Combat (Dual Wielding)\n\n[OFF-HAND] **Requires Dual Wield unlocks** from the **Weapons** skill track...';

console.log('🔍 VECTOR SEARCH QUALITY DIAGNOSTIC');
console.log('=====================================');
console.log(`Query: "${query}"`);
console.log(`Target Point ID: ${TARGET_POINT_ID}`);
console.log('');

async function getEmbedding(text) {
  try {
    const response = await fetch(EMBEDDING_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: [text] })
    });

    if (!response.ok) {
      throw new Error(`Embedding service error: ${response.status}`);
    }

    const embeddings = await response.json();
    return embeddings[0]; // Get first embedding
  } catch (error) {
    console.error('❌ Embedding service failed:', error.message);
    return null;
  }
}

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

function l2Normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector.map(() => 0);
  return vector.map(v => v / norm);
}

async function getPointFromQdrant(pointId) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/${pointId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Qdrant error: ${response.status}`);
    }

    const result = await response.json();
    return result.result;
  } catch (error) {
    console.error('❌ Failed to fetch point from Qdrant:', error.message);
    return null;
  }
}

async function searchQdrant(vector, limit = 10) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: vector,
        limit: limit,
        with_payload: true,
        with_vector: false
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant search error: ${response.status}`);
    }

    const result = await response.json();
    return result.result;
  } catch (error) {
    console.error('❌ Qdrant search failed:', error.message);
    return [];
  }
}

async function performDiagnostic() {
  console.log('🔄 Step 1: Testing embedding service...');

  // Get query embedding
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) {
    console.log('❌ Failed to get query embedding. Aborting diagnostic.');
    return;
  }

  console.log(`✅ Query embedding generated (${queryEmbedding.length} dimensions)`);
  console.log(`   First 5 values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

  // Normalize query embedding
  const normalizedQueryEmbedding = l2Normalize(queryEmbedding);
  const queryNorm = Math.sqrt(normalizedQueryEmbedding.reduce((sum, v) => sum + v * v, 0));
  console.log(`   Query vector L2 norm after normalization: ${queryNorm.toFixed(6)}`);

  console.log('\n🔄 Step 2: Fetching target point from Qdrant...');

  // Get the target point
  const targetPoint = await getPointFromQdrant(TARGET_POINT_ID);
  if (!targetPoint) {
    console.log('❌ Failed to fetch target point. Checking if it exists...');
    return;
  }

  console.log('✅ Target point found in Qdrant');
  console.log(`   Content preview: "${(targetPoint.payload.content || '').substring(0, 100)}..."`);
  console.log(`   Document ID: ${targetPoint.payload.docId}`);
  console.log(`   Tenant: ${targetPoint.payload.tenant}`);
  console.log(`   ACL: ${JSON.stringify(targetPoint.payload.acl)}`);

  // Get target content embedding
  console.log('\n🔄 Step 3: Testing embedding similarity...');

  const targetContent = targetPoint.payload.content || '';
  const targetEmbedding = await getEmbedding(targetContent);
  if (!targetEmbedding) {
    console.log('❌ Failed to get target content embedding');
    return;
  }

  console.log(`✅ Target content embedding generated (${targetEmbedding.length} dimensions)`);
  console.log(`   First 5 values: [${targetEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

  // Normalize target embedding
  const normalizedTargetEmbedding = l2Normalize(targetEmbedding);

  // Calculate direct similarity
  const directSimilarity = cosineSimilarity(normalizedQueryEmbedding, normalizedTargetEmbedding);
  console.log(`\n📊 Direct Embedding Similarity: ${directSimilarity.toFixed(6)}`);

  // Test various query variants
  console.log('\n🔄 Step 4: Testing query variants...');

  const queryVariants = [
    'Off-Hand Combat',
    'Dual Wielding',
    'dual wield rules',
    'off hand combat rules',
    'Dual Wield unlocks',
    '🗡 Off-Hand Combat (Dual Wielding)'
  ];

  for (const variant of queryVariants) {
    const variantEmbedding = await getEmbedding(variant);
    if (variantEmbedding) {
      const normalizedVariant = l2Normalize(variantEmbedding);
      const similarity = cosineSimilarity(normalizedVariant, normalizedTargetEmbedding);
      console.log(`   "${variant}": ${similarity.toFixed(6)}`);
    }
  }

  console.log('\n🔄 Step 5: Testing direct Qdrant vector search...');

  // Test direct search with query embedding
  const searchResults = await searchQdrant(normalizedQueryEmbedding, 10);

  if (searchResults.length === 0) {
    console.log('❌ No results from Qdrant vector search!');
    return;
  }

  console.log(`✅ Qdrant returned ${searchResults.length} results`);

  // Check if target is in results
  let targetFound = false;
  let targetRank = -1;

  searchResults.forEach((result, index) => {
    const isTarget = result.id === TARGET_POINT_ID;
    const contentPreview = (result.payload.content || '').substring(0, 80);

    if (isTarget) {
      targetFound = true;
      targetRank = index + 1;
      console.log(`🎯 RANK ${index + 1}: TARGET FOUND! Score: ${result.score.toFixed(6)}`);
      console.log(`   Content: "${contentPreview}..."`);
    } else {
      console.log(`   Rank ${index + 1}: Score: ${result.score.toFixed(6)}, Content: "${contentPreview}..."`);
    }
  });

  if (!targetFound) {
    console.log(`❌ TARGET POINT ${TARGET_POINT_ID} NOT FOUND in top 10 results!`);
    console.log('\n🔄 Testing with larger search scope...');

    // Try with larger limit
    const largerSearchResults = await searchQdrant(normalizedQueryEmbedding, 50);
    const targetInLarger = largerSearchResults.find(r => r.id === TARGET_POINT_ID);

    if (targetInLarger) {
      const largerRank = largerSearchResults.findIndex(r => r.id === TARGET_POINT_ID) + 1;
      console.log(`📍 Target found at rank ${largerRank}/50 with score: ${targetInLarger.score.toFixed(6)}`);
    } else {
      console.log('❌ Target not found even in top 50 results!');
    }
  } else {
    console.log(`✅ Target found at rank ${targetRank} - this is ${targetRank <= 3 ? 'GOOD' : targetRank <= 10 ? 'ACCEPTABLE' : 'POOR'}`);
  }

  console.log('\n🔄 Step 6: Analyzing collection statistics...');

  // Get collection info
  try {
    const collectionInfo = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (collectionInfo.ok) {
      const info = await collectionInfo.json();
      console.log(`✅ Collection "${COLLECTION_NAME}" status:`);
      console.log(`   Total points: ${info.result.points_count}`);
      console.log(`   Vector size: ${info.result.config.params.vectors.size}`);
      console.log(`   Distance metric: ${info.result.config.params.vectors.distance}`);
      console.log(`   Status: ${info.result.status}`);
    }
  } catch (error) {
    console.log('⚠️  Could not fetch collection info:', error.message);
  }

  console.log('\n📋 DIAGNOSTIC SUMMARY');
  console.log('=====================');
  console.log(`Direct similarity score: ${directSimilarity.toFixed(6)}`);
  console.log(`Target found in search: ${targetFound ? 'YES' : 'NO'}`);
  if (targetFound) {
    console.log(`Target rank: ${targetRank}/10`);
  }
  console.log(`Embedding service: ${queryEmbedding ? 'WORKING' : 'FAILED'}`);
  console.log(`Qdrant connectivity: ${searchResults.length > 0 ? 'WORKING' : 'FAILED'}`);

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('==================');

  if (directSimilarity < 0.5) {
    console.log('⚠️  LOW SIMILARITY: The query and target content have low semantic similarity');
    console.log('   - Consider improving the embedding model');
    console.log('   - Review document chunking strategy');
    console.log('   - Test with more specific queries');
  }

  if (!targetFound) {
    console.log('🔥 CRITICAL: Target not found in search results');
    console.log('   - Check RBAC filters in production code');
    console.log('   - Verify collection indexing');
    console.log('   - Test with exact vector from target point');
  }

  if (targetFound && targetRank > 5) {
    console.log('⚠️  POOR RANKING: Target found but ranking is low');
    console.log('   - Consider hybrid search (vector + keyword)');
    console.log('   - Implement reranking');
    console.log('   - Adjust search parameters');
  }
}

// Run the diagnostic
performDiagnostic().catch(console.error);