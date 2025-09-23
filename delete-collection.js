/**
 * Delete Qdrant Collection - Clean slate for testing fixed ingestion
 */

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';

async function deleteCollection() {
  console.log('🗑️  DELETING QDRANT COLLECTION');
  console.log('==============================');
  console.log(`Collection: ${COLLECTION_NAME}`);
  console.log(`Qdrant URL: ${QDRANT_URL}`);

  console.log('\n🔄 Step 1: Checking collection status...');

  try {
    // Check if collection exists
    const infoResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (infoResponse.status === 404) {
      console.log('✅ Collection does not exist - nothing to delete');
      return;
    }

    if (!infoResponse.ok) {
      throw new Error(`Failed to check collection: ${infoResponse.status} ${infoResponse.statusText}`);
    }

    const collectionInfo = await infoResponse.json();
    console.log(`✅ Collection found with ${collectionInfo.result.points_count} points`);

    console.log('\n🔄 Step 2: Deleting collection...');

    // Delete the collection
    const deleteResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete collection: ${deleteResponse.status} ${deleteResponse.statusText}`);
    }

    console.log('✅ Collection deleted successfully');

    console.log('\n🔄 Step 3: Verifying deletion...');

    // Verify deletion
    const verifyResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (verifyResponse.status === 404) {
      console.log('✅ Deletion verified - collection no longer exists');
    } else {
      console.log('⚠️  Warning: Collection still exists after deletion attempt');
    }

    console.log('\n📋 DELETION SUMMARY');
    console.log('===================');
    console.log('✅ Collection deleted successfully');
    console.log('✅ Ready for fresh ingestion with fixed embeddings');

    console.log('\n💡 NEXT STEPS');
    console.log('=============');
    console.log('1. 🔄 Restart the API server to recreate the collection');
    console.log('2. 📤 Re-upload your documents using the ingestion endpoint');
    console.log('3. 🧪 Test vector search with the same query');
    console.log('4. ✅ Verify target document now ranks in top 3 results');

  } catch (error) {
    console.error('❌ Error during collection deletion:', error.message);
    console.log('\n💡 TROUBLESHOOTING');
    console.log('==================');
    console.log('- Check that Qdrant is running at', QDRANT_URL);
    console.log('- Verify network connectivity');
    console.log('- Check Qdrant logs for errors');
  }
}

// Run the deletion
deleteCollection().catch(console.error);