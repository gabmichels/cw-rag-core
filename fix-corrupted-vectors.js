/**
 * Fix Corrupted Vectors - Re-ingest documents with proper embeddings
 */

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';
const EMBEDDING_SERVICE_URL = 'http://localhost:8080/embed';
const TARGET_POINT_ID = 'a3d5597a-1d56-b174-03e0-fc7f2722b64e';

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

async function getPoint(pointId) {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/${pointId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  const result = await response.json();
  return result.result;
}

async function updatePointVector(pointId, newVector) {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{
        id: pointId,
        vector: newVector
      }]
    })
  });
  return response.ok;
}

async function searchWithVector(vector, limit = 10) {
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
  const result = await response.json();
  return result.result;
}

async function fixCorruptedVectors() {
  console.log('🔧 FIXING CORRUPTED VECTORS');
  console.log('===========================');

  console.log('🔄 Step 1: Fetching corrupted point...');
  const targetPoint = await getPoint(TARGET_POINT_ID);

  if (!targetPoint) {
    console.log('❌ Target point not found!');
    return;
  }

  const content = targetPoint.payload.content;
  const storedVector = targetPoint.vector;

  console.log('✅ Target point found');
  console.log(`   Point ID: ${TARGET_POINT_ID}`);
  console.log(`   Content preview: "${content.substring(0, 80)}..."`);
  console.log(`   Stored vector norm: ${Math.sqrt(storedVector.reduce((sum, v) => sum + v * v, 0)).toFixed(6)}`);

  console.log('\n🔄 Step 2: Generating correct embedding...');
  const correctEmbedding = await getEmbedding(content);
  const normalizedEmbedding = l2Normalize(correctEmbedding);

  console.log(`✅ Correct embedding generated`);
  console.log(`   Embedding length: ${correctEmbedding.length}`);
  console.log(`   Normalized norm: ${Math.sqrt(normalizedEmbedding.reduce((sum, v) => sum + v * v, 0)).toFixed(6)}`);
  console.log(`   First 5 values: [${normalizedEmbedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

  console.log('\n🔄 Step 3: Testing before fix...');
  const query = 'What are the rules for Off-Hand Combat (Dual Wielding)?';
  const queryEmbedding = await getEmbedding(query);
  const normalizedQuery = l2Normalize(queryEmbedding);

  const beforeResults = await searchWithVector(normalizedQuery, 10);
  const beforeRank = beforeResults.findIndex(r => r.id === TARGET_POINT_ID) + 1;

  console.log(`   Query: "${query}"`);
  console.log(`   Target rank BEFORE fix: ${beforeRank > 0 ? beforeRank : 'NOT FOUND'} / 10`);

  console.log('\n🔄 Step 4: Updating point with correct vector...');
  const updateSuccess = await updatePointVector(TARGET_POINT_ID, normalizedEmbedding);

  if (!updateSuccess) {
    console.log('❌ Failed to update point vector!');
    return;
  }

  console.log('✅ Point vector updated successfully');

  console.log('\n🔄 Step 5: Testing after fix...');

  // Wait a moment for Qdrant to process the update
  await new Promise(resolve => setTimeout(resolve, 1000));

  const afterResults = await searchWithVector(normalizedQuery, 10);
  const afterRank = afterResults.findIndex(r => r.id === TARGET_POINT_ID) + 1;

  console.log(`   Target rank AFTER fix: ${afterRank > 0 ? afterRank : 'NOT FOUND'} / 10`);

  if (afterRank > 0) {
    const targetResult = afterResults[afterRank - 1];
    console.log(`   Target score: ${targetResult.score.toFixed(6)}`);
    console.log(`   Improvement: ${beforeRank > 0 ? `Rank ${beforeRank} → ${afterRank}` : `NOT FOUND → Rank ${afterRank}`}`);
  }

  console.log('\n🔄 Step 6: Displaying top results...');
  afterResults.forEach((result, i) => {
    const isTarget = result.id === TARGET_POINT_ID;
    const contentPreview = (result.payload.content || '').substring(0, 60);
    const marker = isTarget ? '🎯' : '  ';
    console.log(`   ${marker} Rank ${i + 1}: Score ${result.score.toFixed(6)} - "${contentPreview}..."`);
  });

  console.log('\n📋 FIX SUMMARY');
  console.log('==============');
  console.log(`Point updated: ${updateSuccess ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Before rank: ${beforeRank > 0 ? beforeRank : 'NOT FOUND'}`);
  console.log(`After rank: ${afterRank > 0 ? afterRank : 'NOT FOUND'}`);

  if (afterRank > 0 && afterRank <= 3) {
    console.log('🎉 SUCCESS! Target document now ranks in top 3');
  } else if (afterRank > 0 && afterRank <= 10) {
    console.log('✅ GOOD! Target document now found in top 10');
  } else if (afterRank > 0) {
    console.log('⚠️  PARTIAL: Target found but ranking still poor');
  } else {
    console.log('❌ FAILED: Target still not found in top 10');
  }

  console.log('\n💡 NEXT STEPS');
  console.log('=============');
  if (afterRank > 0 && afterRank <= 3) {
    console.log('✅ Vector search is now working correctly!');
    console.log('✅ Re-enable hybrid search for even better results');
    console.log('✅ Consider reprocessing all documents with proper embeddings');
  } else {
    console.log('⚠️  Additional investigation needed:');
    console.log('   - Check RBAC filters in production search');
    console.log('   - Verify search parameters and limits');
    console.log('   - Consider hybrid search + reranking');
  }
}

// Run the fix
fixCorruptedVectors().catch(console.error);