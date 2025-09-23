/**
 * Vector Storage Diagnostic - Tests if vectors are stored/retrieved correctly
 */

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';
const TARGET_POINT_ID = 'a3d5597a-1d56-b174-03e0-fc7f2722b64e';
const EMBEDDING_SERVICE_URL = 'http://localhost:8080/embed';

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

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function getPointWithVector(pointId) {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/${pointId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  const result = await response.json();
  return result.result;
}

async function performStorageDiagnostic() {
  console.log('🔍 VECTOR STORAGE DIAGNOSTIC');
  console.log('============================');

  // Get the target point WITH its stored vector
  console.log('🔄 Step 1: Fetching target point with stored vector...');
  const targetPoint = await getPointWithVector(TARGET_POINT_ID);

  if (!targetPoint) {
    console.log('❌ Target point not found!');
    return;
  }

  const storedVector = targetPoint.vector;
  const content = targetPoint.payload.content;

  console.log('✅ Target point retrieved');
  console.log(`   Content preview: "${content.substring(0, 80)}..."`);
  console.log(`   Stored vector length: ${storedVector.length}`);
  console.log(`   First 5 stored values: [${storedVector.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

  // Calculate stored vector norm
  const storedNorm = Math.sqrt(storedVector.reduce((sum, v) => sum + v * v, 0));
  console.log(`   Stored vector L2 norm: ${storedNorm.toFixed(6)}`);

  // Generate fresh embedding for the same content
  console.log('\n🔄 Step 2: Generating fresh embedding for same content...');
  const freshEmbedding = await getEmbedding(content);
  const normalizedFresh = l2Normalize(freshEmbedding);

  console.log(`   Fresh embedding length: ${freshEmbedding.length}`);
  console.log(`   First 5 fresh values: [${freshEmbedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
  console.log(`   Fresh vector L2 norm after normalization: ${Math.sqrt(normalizedFresh.reduce((sum, v) => sum + v * v, 0)).toFixed(6)}`);

  // Compare stored vs fresh vectors
  console.log('\n📊 Vector Comparison:');
  const storedVsFresh = cosineSimilarity(storedVector, normalizedFresh);
  console.log(`   Stored vs Fresh similarity: ${storedVsFresh.toFixed(6)}`);

  if (storedVsFresh < 0.99) {
    console.log('🔥 CRITICAL: Stored vector differs from fresh embedding!');
    console.log('   This suggests vector corruption or normalization issues.');
  } else {
    console.log('✅ Stored vector matches fresh embedding');
  }

  // Test query embedding
  const query = 'What are the rules for Off-Hand Combat (Dual Wielding)?';
  console.log('\n🔄 Step 3: Testing query embedding...');
  const queryEmbedding = await getEmbedding(query);
  const normalizedQuery = l2Normalize(queryEmbedding);

  console.log(`   Query embedding length: ${queryEmbedding.length}`);
  console.log(`   First 5 query values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

  // Test all similarities
  console.log('\n📊 Similarity Matrix:');
  const queryVsStored = cosineSimilarity(normalizedQuery, storedVector);
  const queryVsFresh = cosineSimilarity(normalizedQuery, normalizedFresh);

  console.log(`   Query vs Stored: ${queryVsStored.toFixed(6)}`);
  console.log(`   Query vs Fresh:  ${queryVsFresh.toFixed(6)}`);

  // Test exact vector search using stored vector
  console.log('\n🔄 Step 4: Testing search with exact stored vector...');
  const exactSearchResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: storedVector,
      limit: 5,
      with_payload: true,
      with_vector: false
    })
  });

  const exactResults = await exactSearchResponse.json();
  console.log(`   Exact vector search results: ${exactResults.result.length}`);

  let selfFound = false;
  exactResults.result.forEach((result, i) => {
    const isSelf = result.id === TARGET_POINT_ID;
    if (isSelf) {
      selfFound = true;
      console.log(`   🎯 Rank ${i + 1}: SELF MATCH - Score: ${result.score.toFixed(6)}`);
    } else {
      console.log(`   Rank ${i + 1}: Score: ${result.score.toFixed(6)}, Content: "${(result.payload.content || '').substring(0, 40)}..."`);
    }
  });

  if (!selfFound) {
    console.log('🔥 CRITICAL: Point not found even when searching with its own vector!');
  } else {
    console.log('✅ Self-match successful');
  }

  // Test normalized fresh embedding search
  console.log('\n🔄 Step 5: Testing search with normalized fresh embedding...');
  const freshSearchResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: normalizedFresh,
      limit: 5,
      with_payload: true,
      with_vector: false
    })
  });

  const freshResults = await freshSearchResponse.json();
  console.log(`   Fresh embedding search results: ${freshResults.result.length}`);

  let targetFoundInFresh = false;
  freshResults.result.forEach((result, i) => {
    const isTarget = result.id === TARGET_POINT_ID;
    if (isTarget) {
      targetFoundInFresh = true;
      console.log(`   🎯 Rank ${i + 1}: TARGET FOUND - Score: ${result.score.toFixed(6)}`);
    } else {
      console.log(`   Rank ${i + 1}: Score: ${result.score.toFixed(6)}, Content: "${(result.payload.content || '').substring(0, 40)}..."`);
    }
  });

  console.log('\n📋 DIAGNOSTIC SUMMARY');
  console.log('=====================');
  console.log(`Stored vs Fresh vectors match: ${storedVsFresh > 0.99 ? 'YES' : 'NO'}`);
  console.log(`Query vs Stored similarity: ${queryVsStored.toFixed(6)}`);
  console.log(`Query vs Fresh similarity: ${queryVsFresh.toFixed(6)}`);
  console.log(`Self-match with stored vector: ${selfFound ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Target found with fresh embedding: ${targetFoundInFresh ? 'YES' : 'NO'}`);

  // Analysis
  console.log('\n💡 ANALYSIS');
  console.log('===========');

  if (storedVsFresh < 0.99) {
    console.log('🔥 Vector storage corruption detected!');
  } else if (!selfFound) {
    console.log('🔥 Qdrant indexing issue - point cannot find itself!');
  } else if (queryVsStored < 0.5) {
    console.log('⚠️  Low semantic similarity between query and content');
  } else if (!targetFoundInFresh) {
    console.log('🔥 Search mechanism failure - good similarity but poor ranking');
  } else {
    console.log('✅ Vector storage and search appear correct');
  }
}

performStorageDiagnostic().catch(console.error);