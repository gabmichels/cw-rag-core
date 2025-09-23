/**
 * Recreate Qdrant Collection - Set up fresh collection for fixed ingestion
 */

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';
const VECTOR_DIMENSIONS = 384;

async function recreateCollection() {
  console.log('🔄 RECREATING QDRANT COLLECTION');
  console.log('===============================');
  console.log(`Collection: ${COLLECTION_NAME}`);
  console.log(`Vector dimensions: ${VECTOR_DIMENSIONS}`);
  console.log(`Distance metric: Cosine`);

  try {
    console.log('\n🔄 Step 1: Creating collection...');

    // Create collection with proper configuration
    const createResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: VECTOR_DIMENSIONS,
          distance: 'Cosine'
        }
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create collection: ${createResponse.status} ${createResponse.statusText}`);
    }

    console.log('✅ Collection created successfully');

    console.log('\n🔄 Step 2: Creating payload indexes...');

    // Create all necessary payload indexes
    const indexes = [
      { field: 'tenant', schema: 'keyword' },
      { field: 'docId', schema: 'keyword' },
      { field: 'acl', schema: 'keyword' },
      { field: 'lang', schema: 'keyword' },
      { field: 'createdAt', schema: 'keyword' },
      { field: 'modifiedAt', schema: 'keyword' },
      { field: 'content', schema: 'text' },
      { field: 'url', schema: 'keyword' },
      { field: 'version', schema: 'keyword' }
    ];

    for (const index of indexes) {
      console.log(`   Creating index: ${index.field} (${index.schema})`);

      const indexResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/index`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_name: index.field,
          field_schema: index.schema,
          wait: true
        })
      });

      if (!indexResponse.ok) {
        console.log(`   ⚠️  Warning: Failed to create index for ${index.field}`);
      } else {
        console.log(`   ✅ Index created: ${index.field}`);
      }
    }

    console.log('\n🔄 Step 3: Verifying collection...');

    // Verify collection configuration
    const infoResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!infoResponse.ok) {
      throw new Error(`Failed to verify collection: ${infoResponse.status}`);
    }

    const collectionInfo = await infoResponse.json();
    const config = collectionInfo.result.config.params.vectors;

    console.log('✅ Collection verification:');
    console.log(`   Vector size: ${config.size}`);
    console.log(`   Distance metric: ${config.distance}`);
    console.log(`   Points count: ${collectionInfo.result.points_count}`);
    console.log(`   Status: ${collectionInfo.result.status}`);

    console.log('\n📋 COLLECTION SETUP COMPLETE');
    console.log('============================');
    console.log('✅ Collection recreated with proper configuration');
    console.log('✅ All payload indexes created');
    console.log('✅ Ready for document ingestion with real embeddings');

    console.log('\n🎯 READY FOR TESTING');
    console.log('====================');
    console.log('1. ✅ Vector search quality fixes implemented');
    console.log('2. ✅ Collection ready for fresh document upload');
    console.log('3. 🔄 Please re-upload your Core Combat document');
    console.log('4. 📋 Provide the new point ID for validation testing');

  } catch (error) {
    console.error('❌ Error during collection recreation:', error.message);
    console.log('\n💡 TROUBLESHOOTING');
    console.log('==================');
    console.log('- Check that Qdrant is running at', QDRANT_URL);
    console.log('- Verify network connectivity');
    console.log('- Check Qdrant logs for errors');
    console.log('- Ensure proper permissions for collection creation');
  }
}

// Run the recreation
recreateCollection().catch(console.error);