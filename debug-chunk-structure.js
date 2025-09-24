#!/usr/bin/env node

/**
 * Debug script to examine chunk structure and sectionPath metadata
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

const testPayload = {
  query: "Can you show me the Skill Table for Artistry please?",
  userContext: {
    id: "test-user",
    groupIds: ["public"],
    tenantId: "zenithfall"
  },
  includeMetrics: true,
  includeDebugInfo: true,
  k: 10
};

async function debugChunkStructure() {
  console.log('🔍 Debug: Examining chunk structure and metadata');
  console.log('='.repeat(50));

  try {
    const response = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();

    if (result.retrievedDocuments && result.retrievedDocuments.length > 0) {
      console.log(`📋 Found ${result.retrievedDocuments.length} documents`);

      result.retrievedDocuments.forEach((doc, index) => {
        console.log(`\n📄 Document ${index + 1}:`);
        console.log(`  ID: ${doc.document.id}`);
        console.log(`  Score: ${doc.score}`);
        console.log(`  Search Type: ${doc.searchType}`);

        // Show full payload structure
        console.log(`  Payload Keys: ${Object.keys(doc.document.metadata || {}).join(', ')}`);
        console.log(`  Full Metadata:`, JSON.stringify(doc.document.metadata, null, 2));

        // Look for sectionPath variants
        const payload = doc.document.metadata || {};
        const sectionPathVariants = [
          payload.sectionPath,
          payload.section_path,
          payload.metadata?.sectionPath,
          payload.chunkId,
          payload.documentId
        ];

        console.log(`  SectionPath Variants:`, sectionPathVariants);

        // Show content preview to check for table structure
        const content = doc.document.content || '';
        console.log(`  Content Preview: ${content.substring(0, 150)}...`);

        // Check for table indicators
        const tableIndicators = ['tier', 'table', '|', 'abilities', 'examples'];
        const foundIndicators = tableIndicators.filter(indicator =>
          content.toLowerCase().includes(indicator)
        );
        console.log(`  Table Indicators Found: ${foundIndicators.join(', ')}`);
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugChunkStructure().catch(console.error);