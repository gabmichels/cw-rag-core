#!/usr/bin/env node

/**
 * Test script to verify guardrail fix for the specific query:
 * "Can you show me the Skill Table for Artistry please?"
 *
 * Expected behavior:
 * - Should find document with ID: 69fbb454-b310-59b0-e53c-6ab7d4909bfe
 * - Should pass guardrail evaluation
 * - Should return a proper answer (not IDK response)
 * - Should demonstrate streaming behavior
 * - Should ensure two sections with "block_9/part_[N]" sectionPath are passed to the LLM.
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
  k: 10 // Requesting 10 documents
};

/**
 * The complete, expected table for Artistry.
 */
const completeArtistryTable = `| Tier            | Concrete Abilities                                                                           | Examples                  |
| --------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| **Novice**      | Perform • Busk • Fake Performance • Mimic Voice • Read the Room                              | Basic performance         |
| **Apprentice**  | Inspire • Stagecraft • Quick Costume Change • Rumor Seeding • Craft Symbol                   | Persuasion and art        |
| **Journeyman**  | Heartstring • Impersonate Official • Stage Fire • Emotional Carve • Persuasive Speech        | Rallying art              |
| **Master**      | Command Performance • Discourse Duel • Master Forgery (art/relics) • Anthem • Stage Blackout | Signature persuasion      |
| **Grandmaster** | Crowd Command • Masterpiece Reveal • Voice of Authority • Cultural Meme • Living Art         | City-scale persuasion     |
| **Legendary**   | Anthem of Nations • Mass Mirage • Icon Forge • Masterstroke • Legacy Performance             | Campaign-scale persuasion |
| **Mythic**      | Song of Peace/War • Culture Rewrite • Living Myth • Word that Moves Kings • Monument Birth   | Epoch-shaping art         |`;


/**
 * Validate that all required skill tiers are present in the answer
 */
function validateSkillTableCompleteness(answer) {
  const expectedTiers = [
    'Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'
  ];
  const foundTiers = [];

  for (const tier of expectedTiers) {
    if (answer.toLowerCase().includes(tier.toLowerCase())) {
      foundTiers.push(tier);
    }
  }

  console.log();
  console.log('🎯 SKILL TIER ANALYSIS:');
  console.log('-'.repeat(30));
  console.log(`Expected tiers: ${expectedTiers.join(', ')}`);
  console.log(`Found tiers: ${foundTiers.join(', ')}`);
  console.log(`Missing tiers: ${expectedTiers.filter(t => !foundTiers.includes(t)).join(', ')}`);
  console.log(`Completeness: ${foundTiers.length}/${expectedTiers.length} (${(foundTiers.length/expectedTiers.length*100).toFixed(1)}%)`);

  const isComplete = foundTiers.length === expectedTiers.length;
  console.log(`Status: ${isComplete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);

  // You can also add a more robust structural comparison here if needed
  if (!isComplete) {
      console.log('Comparison against expected table might be useful:');
      console.log(completeArtistryTable);
  }

  return {
    isComplete,
    foundTiers,
    missingTiers: expectedTiers.filter(t => !foundTiers.includes(t)),
    completeness: foundTiers.length / expectedTiers.length
  };
}

async function testGuardrailFix() {
  console.log('🧪 Testing Guardrail Fix (Streaming Endpoint with Context Dump)');
  console.log('='.repeat(50));
  console.log('Query:', testPayload.query);
  console.log('Expected document ID:', '69fbb454-b310-59b0-e53c-6ab7d4909bfe');
  console.log('Streaming API URL:', `${API_URL}/ask/stream`);
  console.log();

  let accumulatedAnswer = '';
  // Initialize result with default values to be updated by stream events
  let finalResult = {
    answer: '',
    retrievedDocuments: [],
    guardrailDecision: {
      isAnswerable: false,
      confidence: 0,
      reasonCode: 'STREAMING_INCOMPLETE', // Default until full response
    },
    metrics: {},
    freshnessStats: {},
    citations: [],
    isIDontKnow: false,
  };
  let rawLlmContextDocuments = []; // To store documents for LLM context verification

  try {
    const startTime = Date.now();

    console.log('📡 Making API streaming request...');
    const response = await fetch(`${API_URL}/ask/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache', // Ensure no caching at this level
      },
      body: JSON.stringify(testPayload)
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    if (!response.body) {
      console.error('❌ Response body is null');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log(`✅ Streaming connection established.`);
    console.log('💬 STREAMING ANSWER:');
    console.log('---');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let eventDelimiterIndex;
      while ((eventDelimiterIndex = buffer.indexOf('\n\n')) !== -1) {
        const eventString = buffer.substring(0, eventDelimiterIndex);
        buffer = buffer.substring(eventDelimiterIndex + 2);

        const lines = eventString.split('\n');
        let eventType = '';
        let eventData = {};

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              eventData = JSON.parse(line.substring(6));
            } catch (e) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }

        switch (eventType) {
          case 'connection_opened':
            // console.log('OPENED:', eventData);
            break;
          case 'chunk':
            accumulatedAnswer += (eventData.text || '');
            process.stdout.write(eventData.text || ''); // Print chunks as they arrive
            break;
          case 'citations':
            finalResult.citations = eventData;
            break;
          case 'metadata':
            finalResult.freshnessStats = eventData.freshnessStats;
            if (eventData.synthesisTime) finalResult.metrics.synthesisTime = eventData.synthesisTime;
            // Capture raw documents if available in metadata for context verification
            if (eventData.retrievedDocuments) {
                rawLlmContextDocuments = eventData.retrievedDocuments;
            }
            break;
          case 'response_completed':
            finalResult = { ...finalResult, ...eventData }; // Update main result object
            finalResult.answer = accumulatedAnswer; // Ensure 'answer' is the full accumulated text
            break;
          case 'error':
            console.error('\n❌ STREAMING ERROR:', eventData.message);
            finalResult.isIDontKnow = true;
            finalResult.guardrailDecision.isAnswerable = false;
            finalResult.guardrailDecision.reasonCode = 'STREAMING_ERROR';
            finalResult.answer = eventData.message;
            break;
          case 'done':
            break;
          default:
            console.log(`\nUNKNOWN EVENT [${eventType}]:`, eventData);
        }
      }
    }
    console.log('\n---'); // End streaming output separator

    const responseTime = performance.now() - startTime;
    console.log(`\n✅ Full streaming response received in ${responseTime.toFixed(0)}ms`);
    console.log();

    // Now, analyze the final result object
    console.log('🔍 GUARDRAIL ANALYSIS (from finalResult):');
    console.log('-'.repeat(30));
    const guardrail = finalResult.guardrailDecision;

    if (guardrail) {
      console.log(`Is Answerable: ${guardrail.isAnswerable ? '✅ YES' : '❌ NO'}`);
      console.log(`Confidence: ${(guardrail.confidence * 100).toFixed(1)}%`);
      if (guardrail.scoreStats) {
        console.log('Score Statistics (from final response):');
        console.log(`  Max Score: ${(guardrail.scoreStats.max * 100).toFixed(1)}%`);
        console.log(`  Mean Score: ${(guardrail.scoreStats.mean * 100).toFixed(1)}%`);
        console.log(`  Std Dev: ${guardrail.scoreStats.stdDev.toFixed(3)}`);
        console.log(`  Result Count: ${guardrail.scoreStats.count}`);
      }
      if (guardrail.sourceAwareConfidence) {
        console.log('Source-Aware Confidence (from final response):');
        const stages = guardrail.sourceAwareConfidence.stageConfidences;
        if (stages.fusion) {
          console.log(`  Fusion: ${(stages.fusion.confidence * 100).toFixed(1)}% (top: ${(stages.fusion.topScore * 100).toFixed(1)}%)`);
        }
      }
    }

    console.log();
    console.log('📄 DOCUMENT ANALYSIS (from finalResult.retrievedDocuments - RAW LLM CONTEXT):');
    console.log('-'.repeat(30));

    if (finalResult.retrievedDocuments && finalResult.retrievedDocuments.length > 0) {
      console.log(`Found ${finalResult.retrievedDocuments.length} documents provided to LLM.`);

      const expectedDocId = '69fbb454-b310-59b0-e53c-6ab7d4909bfe';
      let foundExpectedDoc = false;
      let block9Part0Found = false;
      let block9Part1Found = false;
      let otherBlock9PartsCount = 0;

      finalResult.retrievedDocuments.forEach((doc, index) => {
        const isExpected = doc.document.id === expectedDocId;
        const marker = isExpected ? '🎯' : '📝';

        console.log(`${marker} Document ${index + 1}:`);
        console.log(`    Document ID: ${doc.document.id}`);
        if (doc.document.metadata?.sectionPath) {
            console.log(`    Section Path: ${doc.document.metadata.sectionPath}`);
            if (doc.document.metadata.sectionPath === 'block_9/part_0') {
                block9Part0Found = true;
            } else if (doc.document.metadata.sectionPath === 'block_9/part_1') {
                block9Part1Found = true;
            } else if (doc.document.metadata.sectionPath.startsWith('block_9/part_')) {
                otherBlock9PartsCount++;
            }
        }
        if (doc.score) console.log(`    Score: ${(doc.score * 100).toFixed(1)}%`);
        if (doc.searchType) console.log(`    Search Type: ${doc.searchType}`);
        const contentPreview = doc.document.content ? doc.document.content.substring(0, 150) : '[No Content]';
        console.log(`    Content Preview: ${contentPreview}...`);

        if (isExpected) {
          foundExpectedDoc = true;
          console.log(`    🎯 THIS IS THE EXPECTED DOCUMENT!`);
        }
        console.log();
      });

      if (foundExpectedDoc) {
        console.log('✅ SUCCESS: Found expected document ID in retrieved documents for LLM.');
      } else {
        console.log('❌ FAILED: Expected document ID not found in retrieved documents for LLM.');
      }

      console.log(`\nSpecific Section Path Check:`);
      console.log(`  block_9/part_0 found: ${block9Part0Found ? '✅ YES' : '❌ NO'}`);
      console.log(`  block_9/part_1 found: ${block9Part1Found ? '✅ YES' : '❌ NO'}`);
      if (block9Part0Found && block9Part1Found) {
          console.log('🎉 SUCCESS: Both block_9/part_0 and block_9/part_1 sections confirmed to be among documents provided to LLM!');
      } else {
          console.log('⚠️ WARNING: Missing one or both of block_9/part_0 and block_9/part_1 in documents provided to LLM.');
      }

    } else {
      console.log('❌ No documents retrieved for LLM context.');
    }

    // Show entire answer
    console.log();
    console.log('💬 FINAL ANSWER (FULL):');
    console.log('-'.repeat(30));
    console.log(finalResult.answer);

    console.log();
    const skillTierAnalysis = validateSkillTableCompleteness(finalResult.answer);
    if (skillTierAnalysis.isComplete) {
      console.log('🎉 TEST COMPLETED SUCCESSFULLY - ALL SKILL TIERS FOUND IN FINAL ANSWER!');
      // Final check against the absolute complete table
      if (finalResult.answer.includes(completeArtistryTable)) {
          console.log('✅ COMPLETED: Final answer matches the absolute complete table content!');
      } else {
          console.log('⚠️ WARNING: Final answer does NOT exactly match the absolute complete table content. There might be subtle differences or missing parts beyond tier names.');
          console.log('Expected content snippet:');
          console.log(completeArtistryTable.substring(0, 500) + '...');
      }
    } else {
      console.log('⚠️ TEST COMPLETED BUT SKILL TABLE IS INCOMPLETE (missing tiers in final answer)');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Check if API is reachable first
async function checkAPIHealth() {
  try {
    console.log('🏥 Checking API health...');
    const response = await fetch(`${API_URL}/healthz`);
    if (response.ok) {
      console.log('✅ API is healthy');
      return true;
    } else {
      console.log(`❌ API health check failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ API not reachable: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔧 GUARDRAIL FIX VERIFICATION TEST');
  console.log('='.repeat(50));
  console.log('This test verifies that the guardrail fixes work correctly');
  console.log('and that the specific query returns the expected document via streaming.');
  console.log();

  const isHealthy = await checkAPIHealth();
  if (!isHealthy) {
    console.log();
    console.log('💡 TROUBLESHOOTING TIPS:');
    console.log('1. Make sure the API container is running: docker-compose up api');
    console.log('2. Check if the API_URL environment variable is correct');
    console.log('3. Verify the API is accessible at:', API_URL);
    return;
  }

  console.log();
  await testGuardrailFix();
}

// Run the test
main().catch(console.error);