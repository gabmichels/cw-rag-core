#!/usr/bin/env node

/**
 * Test script to verify the /ask endpoint works with section-aware retrieval
 * This tests the non-streaming endpoint to ensure it provides complete structured content
 */

// Using built-in fetch (Node.js 18+)

const API_BASE = 'http://localhost:3000';

async function testAskEndpoint() {
  console.log('🧪 Testing /ask endpoint with section-aware retrieval...\n');

  const testQuery = {
    query: "Can you show me the Skill Table for Artistry please?",
    userContext: {
      id: "test-user-001",
      groupIds: ["public"],
      tenantId: "zenithfall"
    },
    includeMetrics: true
  };

  try {
    console.log('📤 Sending request to /ask endpoint...');
    console.log('Query:', JSON.stringify(testQuery, null, 2));

    const startTime = Date.now();

    const response = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testQuery)
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log(`✅ Response received in ${responseTime}ms\n`);

    // Analyze the response
    console.log('📊 Response Analysis:');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));

    // Check for all 7 skill tiers
    const skillTiers = ['Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'];

    if (result.answer) {
      console.log('\n📝 Answer received (length):', result.answer.length);
      const foundTiers = skillTiers.filter(tier => result.answer.includes(tier));

      console.log('\n🎯 Skill Tier Analysis:');
      console.log(`Found ${foundTiers.length}/7 skill tiers:`, foundTiers);

      if (foundTiers.length === 7) {
        console.log('✅ SUCCESS: All 7 skill tiers found in response!');
      } else {
        console.log('❌ INCOMPLETE: Missing tiers:', skillTiers.filter(tier => !foundTiers.includes(tier)));
      }
    }

    // Check section completion metrics
    if (result.metrics && result.metrics.sectionCompletionMetrics) {
      console.log('\n📈 Section Completion Metrics:');
      const metrics = result.metrics.sectionCompletionMetrics;
      console.log(`- Sections Detected: ${metrics.sectionsDetected}`);
      console.log(`- Sections Completed: ${metrics.sectionsCompleted}`);
      console.log(`- Sections Reconstructed: ${metrics.sectionsReconstructed}`);
      console.log(`- Additional Chunks: ${metrics.totalAdditionalChunks}`);

      if (metrics.sectionsDetected > 0 && metrics.sectionsCompleted > 0) {
        console.log('✅ Section-aware retrieval is active');
      } else {
        console.log('⚠️ Section-aware retrieval may not be working');
      }
    }

    // Check for reconstructed sections in context
    if (result.context && Array.isArray(result.context)) {
      console.log('\n📚 Context Analysis:');
      console.log(`Total context documents: ${result.context.length}`);

      const reconstructedSections = result.context.filter(doc =>
        doc.metadata && doc.metadata.docId && doc.metadata.docId.startsWith('reconstructed-')
      );

      console.log(`Reconstructed sections: ${reconstructedSections.length}`);

      if (reconstructedSections.length > 0) {
        console.log('✅ Reconstructed sections found in context');
        reconstructedSections.forEach(section => {
          console.log(`  - ${section.metadata.docId} (score: ${section.score})`);
        });
      }

      // Check for target sectionPath documents
      const targetSections = result.context.filter(doc =>
        doc.metadata && doc.metadata.sectionPath &&
        (doc.metadata.sectionPath.includes('block_9/part_0') || doc.metadata.sectionPath.includes('block_9/part_1'))
      );

      console.log(`Target section documents (block_9): ${targetSections.length}`);

      if (targetSections.length > 0) {
        console.log('✅ Target section documents found');
        targetSections.forEach(section => {
          console.log(`  - ${section.metadata.docId} (${section.metadata.sectionPath})`);
        });
      }
    }

    // Final assessment
    console.log('\n🏆 Final Assessment:');
    const hasAllTiers = result.answer && skillTiers.every(tier => result.answer.includes(tier));
    const hasMetrics = result.metrics && result.metrics.sectionCompletionMetrics && result.metrics.sectionCompletionMetrics.sectionsDetected > 0;

    if (hasAllTiers && hasMetrics) {
      console.log('✅ SUCCESS: /ask endpoint is working perfectly with section-aware retrieval!');
      console.log('✅ Complete skill table retrieved with all 7 tiers');
      console.log('✅ Section completion metrics show active processing');
      return true;
    } else {
      console.log('❌ ISSUES DETECTED:');
      if (!hasAllTiers) console.log('  - Incomplete skill table (missing tiers)');
      if (!hasMetrics) console.log('  - Section completion metrics missing/zero');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure the API server is running on port 3000');
    }

    return false;
  }
}

// Run the test
testAskEndpoint()
  .then(success => {
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('🎉 /ask endpoint test PASSED');
      process.exit(0);
    } else {
      console.log('💥 /ask endpoint test FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });