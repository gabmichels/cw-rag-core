#!/usr/bin/env node

/**
 * Debug script to directly examine Qdrant sectionPath data
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function debugQdrantSectionPath() {
  console.log('🔍 Debug: Examining Qdrant sectionPath data structure');
  console.log('='.repeat(50));

  try {
    // Query for the specific target document to see its sectionPath
    const response = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "Artistry skill table",
        userContext: {
          id: "test-user",
          groupIds: ["public"],
          tenantId: "zenithfall"
        },
        includeDebugInfo: true,
        k: 20 // Get more results to see different chunks
      })
    });

    const result = await response.json();

    if (result.retrievedDocuments && result.retrievedDocuments.length > 0) {
      console.log(`📋 Found ${result.retrievedDocuments.length} documents`);

      // Look specifically for our target document and similar ones
      const targetId = '69fbb454-b310-59b0-e53c-6ab7d4909bfe';

      result.retrievedDocuments.forEach((doc, index) => {
        const isTarget = doc.document.id === targetId;
        const marker = isTarget ? '🎯' : '📝';

        console.log(`\n${marker} Document ${index + 1}:`);
        console.log(`  ID: ${doc.document.id}`);
        console.log(`  DocId: ${doc.document.metadata.docId}`);
        console.log(`  Score: ${doc.score}`);

        // Show the FULL metadata structure to find sectionPath
        console.log(`  Full Metadata:`, JSON.stringify(doc.document.metadata, null, 2));

        // Check content for skill tier indicators
        const content = doc.document.content || '';
        const skillTiers = ['Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'];
        const foundTiers = skillTiers.filter(tier => content.includes(tier));

        console.log(`  Found Skill Tiers: ${foundTiers.join(', ')}`);
        console.log(`  Content Preview: ${content.substring(0, 200)}...`);

        if (isTarget) {
          console.log(`  🎯 THIS IS THE TARGET DOCUMENT WITH PARTIAL SKILL TABLE!`);
        }
      });

      // Group by docId to see related chunks
      const docGroups = new Map();
      result.retrievedDocuments.forEach(doc => {
        const docId = doc.document.metadata.docId;
        if (!docGroups.has(docId)) {
          docGroups.set(docId, []);
        }
        docGroups.get(docId).push(doc);
      });

      console.log('\n📊 GROUPED BY DOC ID:');
      console.log('-'.repeat(30));
      for (const [docId, docs] of docGroups) {
        console.log(`DocId: ${docId} (${docs.length} chunks)`);
        docs.forEach((doc, i) => {
          console.log(`  ${i+1}. ${doc.document.id} - ${doc.document.content.substring(0, 50)}...`);
        });
      }

    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugQdrantSectionPath().catch(console.error);