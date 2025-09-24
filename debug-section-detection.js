#!/usr/bin/env node

/**
 * Debug script to test section detection logic directly
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function debugSectionDetection() {
  console.log('🔍 Debug: Testing Section Detection Logic');
  console.log('='.repeat(50));

  try {
    // Query for Artistry to get the actual results structure
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
        k: 10
      })
    });

    const result = await response.json();

    if (result.retrievedDocuments && result.retrievedDocuments.length > 0) {
      console.log(`📋 Found ${result.retrievedDocuments.length} documents`);

      // Look specifically for documents with sectionPath
      const documentsWithSectionPath = result.retrievedDocuments.filter(doc => {
        return doc.document?.metadata?.sectionPath ||
               doc.payload?.sectionPath ||
               doc.sectionPath;
      });

      console.log(`📝 Documents with sectionPath: ${documentsWithSectionPath.length}`);

      result.retrievedDocuments.forEach((doc, index) => {
        console.log(`\n📄 Document ${index + 1}:`);
        console.log(`  ID: ${doc.document?.id}`);
        console.log(`  DocId: ${doc.document?.metadata?.docId}`);
        console.log(`  Score: ${doc.score}`);
        console.log(`  SearchType: ${doc.searchType}`);

        // Check all possible locations for sectionPath
        const sectionPath = doc.document?.metadata?.sectionPath ||
                           doc.payload?.sectionPath ||
                           doc.sectionPath ||
                           doc.document?.sectionPath;

        console.log(`  SectionPath: ${sectionPath || 'NOT FOUND'}`);

        if (sectionPath) {
          console.log(`  🎯 FOUND SECTION PATH: ${sectionPath}`);

          // Test the regex pattern
          const regex = /^(block_\d+)(?:\/part_\d+)?$/;
          const match = sectionPath.match(regex);
          if (match) {
            console.log(`  ✅ Regex match: base="${match[1]}"`);
          } else {
            console.log(`  ❌ Regex no match for pattern`);
          }
        }

        // Check for table syntax
        const content = doc.document?.content || doc.content || '';
        const hasTableSyntax = content.includes('|') && content.includes('---');
        console.log(`  HasTableSyntax: ${hasTableSyntax}`);

        console.log(`  Content Preview: ${content.substring(0, 100)}...`);
      });

      // Check for section completion metrics
      if (result.sectionCompletionMetrics) {
        console.log('\n📊 SECTION COMPLETION METRICS:');
        console.log(JSON.stringify(result.sectionCompletionMetrics, null, 2));
      } else {
        console.log('\n❌ NO SECTION COMPLETION METRICS FOUND');
      }

    } else {
      console.log('❌ No documents found');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugSectionDetection().catch(console.error);