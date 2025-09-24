#!/usr/bin/env node

/**
 * Final verification test - show complete answer content
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

async function testFinalVerification() {
  console.log('🎯 Final Verification: Complete Answer Analysis');
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

    console.log('📋 Retrieved Documents:', result.retrievedDocuments.length);

    // Show the first few documents with their types
    result.retrievedDocuments.slice(0, 3).forEach((doc, index) => {
      console.log(`\n📄 Document ${index + 1}:`);
      console.log(`  ID: ${doc.document.id}`);
      console.log(`  Search Type: ${doc.searchType}`);
      console.log(`  Score: ${(doc.score * 100).toFixed(1)}%`);
      console.log(`  Content Length: ${doc.document.content.length} chars`);
      console.log(`  Content Preview: ${doc.document.content.substring(0, 150)}...`);

      // Check for skill tiers in this document
      const content = doc.document.content;
      const skillTiers = ['Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'];
      const foundTiers = skillTiers.filter(tier => content.includes(tier));
      console.log(`  Skill Tiers Found: ${foundTiers.join(', ')}`);
    });

    // Show section completion metrics
    if (result.metrics && result.metrics.sectionCompletionMetrics) {
      console.log('\n🔧 SECTION COMPLETION METRICS:');
      const metrics = result.metrics.sectionCompletionMetrics;
      console.log(`  Sections Detected: ${metrics.sectionsDetected}`);
      console.log(`  Sections Completed: ${metrics.sectionsCompleted}`);
      console.log(`  Sections Reconstructed: ${metrics.sectionsReconstructed}`);
      console.log(`  Additional Chunks: ${metrics.totalAdditionalChunks}`);
      console.log(`  Duration: ${metrics.completionDuration}ms`);
    }

    // Analyze complete answer for skill tiers
    console.log('\n🎯 COMPLETE ANSWER ANALYSIS:');
    console.log('-'.repeat(30));
    const answer = result.answer;
    console.log(`Answer Length: ${answer.length} characters`);

    const skillTiers = ['Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'];
    const foundTiers = skillTiers.filter(tier => answer.includes(tier));
    const missingTiers = skillTiers.filter(tier => !answer.includes(tier));

    console.log(`Found Tiers: ${foundTiers.join(', ')}`);
    console.log(`Missing Tiers: ${missingTiers.join(', ')}`);
    console.log(`Completeness: ${foundTiers.length}/7 (${(foundTiers.length/7*100).toFixed(1)}%)`);

    const isComplete = foundTiers.length === 7;
    console.log(`Status: ${isComplete ? '🎉 COMPLETE SUCCESS!' : '⚠️ Still incomplete'}`);

    // Show full answer if it's reasonably sized
    if (answer.length < 2000) {
      console.log('\n💬 FULL ANSWER:');
      console.log('-'.repeat(30));
      console.log(answer);
    } else {
      console.log('\n💬 ANSWER PREVIEW (first 1000 chars):');
      console.log('-'.repeat(30));
      console.log(answer.substring(0, 1000) + '...');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFinalVerification().catch(console.error);