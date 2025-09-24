#!/usr/bin/env node

/**
 * Debug script to directly query Qdrant and understand sectionPath storage/retrieval
 */

async function debugQdrantDirect() {
  console.log('🔍 Debug: Direct Qdrant Query for SectionPath');
  console.log('='.repeat(60));

  try {
    // Direct Qdrant API call to find documents with sectionPath
    const qdrantUrl = 'http://localhost:6333';
    const collectionName = 'documents';

    console.log('📊 Step 1: Query for any documents with sectionPath metadata');
    const scrollResponse = await fetch(`${qdrantUrl}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: "tenant", match: { value: "zenithfall" } },
            { key: "sectionPath", match: { any: ["block_9"] } }  // Look for any block_9 sectionPath
          ]
        },
        limit: 10,
        with_payload: true,
        with_vector: false
      })
    });

    const scrollData = await scrollResponse.json();
    console.log(`✅ Found ${scrollData.result?.points?.length || 0} points with block_9 sectionPath`);

    if (scrollData.result?.points?.length > 0) {
      scrollData.result.points.forEach((point, index) => {
        console.log(`\n📄 Point ${index + 1}:`);
        console.log(`   ID: ${point.id}`);
        console.log(`   Payload sectionPath: ${point.payload?.sectionPath || 'NOT FOUND'}`);
        console.log(`   Payload docId: ${point.payload?.docId}`);
        console.log(`   Payload chunkId: ${point.payload?.chunkId}`);
        console.log(`   Content preview: ${(point.payload?.content || '').substring(0, 100)}...`);
      });
    }

    console.log('\n📊 Step 2: Query for the specific target document');
    const targetDocResponse = await fetch(`${qdrantUrl}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: "tenant", match: { value: "zenithfall" } },
            { key: "docId", match: { value: "Skill Tables" } }
          ]
        },
        limit: 20,
        with_payload: true,
        with_vector: false
      })
    });

    const targetData = await targetDocResponse.json();
    console.log(`✅ Found ${targetData.result?.points?.length || 0} points for "Skill Tables" docId`);

    if (targetData.result?.points?.length > 0) {
      const targetPoint = targetData.result.points.find(p => p.id === '69fbb454-b310-59b0-e53c-6ab7d4909bfe');
      if (targetPoint) {
        console.log('\n🎯 FOUND TARGET DOCUMENT:');
        console.log(`   ID: ${targetPoint.id}`);
        console.log(`   Full Payload:`, JSON.stringify(targetPoint.payload, null, 2));
      } else {
        console.log('\n❌ Target document not found in results');
        console.log('Available IDs:', targetData.result.points.map(p => p.id));
      }
    }

    console.log('\n📊 Step 3: Test vector search with filters');
    // Simulate a vector search with dummy vector to see what gets returned
    const dummyVector = Array(384).fill(0.1); // 384-dim vector with small values

    const vectorSearchResponse = await fetch(`${qdrantUrl}/collections/${collectionName}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: dummyVector,
        filter: {
          must: [
            { key: "tenant", match: { value: "zenithfall" } },
            { key: "docId", match: { value: "Skill Tables" } }
          ]
        },
        limit: 5,
        with_payload: true,
        with_vector: false
      })
    });

    const vectorData = await vectorSearchResponse.json();
    console.log(`✅ Vector search returned ${vectorData.result?.length || 0} results`);

    if (vectorData.result?.length > 0) {
      vectorData.result.forEach((result, index) => {
        console.log(`\n🔍 Vector Result ${index + 1}:`);
        console.log(`   ID: ${result.id}`);
        console.log(`   Score: ${result.score}`);
        console.log(`   Payload sectionPath: ${result.payload?.sectionPath || 'NOT FOUND'}`);
        console.log(`   Payload docId: ${result.payload?.docId}`);

        if (result.id === '69fbb454-b310-59b0-e53c-6ab7d4909bfe') {
          console.log(`   🎯 THIS IS THE TARGET - sectionPath should be: ${result.payload?.sectionPath}`);
        }
      });
    }

    console.log('\n📊 Step 4: Test prefix matching for related chunks');
    const prefixResponse = await fetch(`${qdrantUrl}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: "tenant", match: { value: "zenithfall" } },
            { key: "docId", match: { value: "Skill Tables" } },
            { key: "sectionPath", match: { text: "block_9" } }  // Prefix match
          ]
        },
        limit: 10,
        with_payload: true,
        with_vector: false
      })
    });

    const prefixData = await prefixResponse.json();
    console.log(`✅ Prefix search for "block_9" returned ${prefixData.result?.points?.length || 0} results`);

    if (prefixData.result?.points?.length > 0) {
      console.log('\n🔍 All block_9 related chunks:');
      prefixData.result.points.forEach((point, index) => {
        console.log(`   ${index + 1}. ID: ${point.id.substring(0, 8)}... sectionPath: ${point.payload?.sectionPath}`);
      });
    }

  } catch (error) {
    console.error('❌ Direct Qdrant query failed:', error);
  }
}

debugQdrantDirect().catch(console.error);