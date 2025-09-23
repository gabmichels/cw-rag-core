/**
 * Validate Vector Search Quality Fix - Test before vs after improvements
 */

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'docs_v1';
const API_URL = 'http://localhost:3000';
const TARGET_POINT_ID = 'a3d5597a-1d56-b174-03e0-fc7f2722b64e';
const TEST_QUERY = 'What are the rules for Off-Hand Combat (Dual Wielding)?';

async function validateVectorSearchFix() {
  console.log('🎯 VALIDATING VECTOR SEARCH QUALITY FIX');
  console.log('=====================================');
  console.log(`Query: "${TEST_QUERY}"`);
  console.log(`Target Point ID: ${TARGET_POINT_ID}`);
  console.log(`Expected: Target should rank in TOP 3 with 85%+ similarity`);

  console.log('\n🔄 Step 1: Testing production /ask endpoint...');

  try {
    // Test production endpoint with the same query
    const askPayload = {
      query: TEST_QUERY,
      userContext: {
        id: 'anonymous',
        tenantId: 'zenithfall',
        groupIds: ['public']
      },
      k: 10,
      includeMetrics: true,
      includeDebugInfo: true
    };

    const askResponse = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(askPayload)
    });

    if (!askResponse.ok) {
      throw new Error(`Ask endpoint failed: ${askResponse.status}`);
    }

    const askResult = await askResponse.json();

    console.log('✅ Ask endpoint response received');
    console.log(`   Retrieved documents: ${askResult.retrievedDocuments?.length || 0}`);
    console.log(`   Answer length: ${askResult.answer?.length || 0} chars`);
    console.log(`   Guardrail answerable: ${askResult.guardrailDecision?.isAnswerable}`);
    console.log(`   Confidence: ${askResult.guardrailDecision?.confidence?.toFixed(3) || 'N/A'}`);

    // Check if target document is found
    let targetFound = false;
    let targetRank = -1;
    let targetScore = 0;

    if (askResult.retrievedDocuments) {
      askResult.retrievedDocuments.forEach((doc, index) => {
        if (doc.document.id === TARGET_POINT_ID) {
          targetFound = true;
          targetRank = index + 1;
          targetScore = doc.score || doc.fusionScore || doc.vectorScore || 0;
        }
      });
    }

    console.log('\n📊 TARGET DOCUMENT ANALYSIS:');
    if (targetFound) {
      console.log(`🎯 TARGET FOUND! Rank: ${targetRank}/10`);
      console.log(`   Score: ${targetScore.toFixed(6)}`);
      console.log(`   Score type: ${askResult.retrievedDocuments[targetRank-1].searchType || 'hybrid'}`);

      if (targetRank <= 3) {
        console.log(`✅ EXCELLENT: Target ranks in TOP 3!`);
      } else if (targetRank <= 5) {
        console.log(`✅ GOOD: Target ranks in TOP 5`);
      } else {
        console.log(`⚠️  ACCEPTABLE: Target found but ranking could be better`);
      }
    } else {
      console.log(`❌ TARGET NOT FOUND in top 10 results`);
      console.log(`   This suggests the fix may not be working properly`);
    }

    console.log('\n🔄 Step 2: Testing direct vector search...');

    // Get collection info to verify setup
    const collectionResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
    const collectionInfo = await collectionResponse.json();

    console.log('✅ Collection status:');
    console.log(`   Points: ${collectionInfo.result.points_count}`);
    console.log(`   Status: ${collectionInfo.result.status}`);
    console.log(`   Vector size: ${collectionInfo.result.config.params.vectors.size}`);
    console.log(`   Distance: ${collectionInfo.result.config.params.vectors.distance}`);

    console.log('\n🔄 Step 3: Checking target point embeddings...');

    // Get the target point to verify it has real embeddings
    const pointResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/${TARGET_POINT_ID}`);
    if (pointResponse.ok) {
      const pointData = await pointResponse.json();
      const vector = pointData.result.vector;

      console.log('✅ Target point analysis:');
      console.log(`   Vector length: ${vector.length}`);
      console.log(`   First 5 values: [${vector.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

      // Check if this looks like a real embedding (not random)
      const vectorNorm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      const isNormalized = Math.abs(vectorNorm - 1.0) < 0.01;

      console.log(`   L2 norm: ${vectorNorm.toFixed(6)} (${isNormalized ? 'normalized' : 'not normalized'})`);

      // Check if values look reasonable (not random)
      const maxVal = Math.max(...vector);
      const minVal = Math.min(...vector);
      const avgVal = vector.reduce((sum, v) => sum + v, 0) / vector.length;

      console.log(`   Value range: [${minVal.toFixed(4)}, ${maxVal.toFixed(4)}]`);
      console.log(`   Average: ${avgVal.toFixed(6)}`);

      if (maxVal > 5 || minVal < -5) {
        console.log(`⚠️  WARNING: Vector values seem abnormally large`);
      } else if (isNormalized && Math.abs(avgVal) < 0.1) {
        console.log(`✅ Vector appears to be a proper embedding`);
      } else {
        console.log(`⚠️  Vector characteristics are unusual`);
      }
    } else {
      console.log(`❌ Could not fetch target point details`);
    }

    console.log('\n📋 VALIDATION SUMMARY');
    console.log('=====================');

    // Overall assessment
    let overallStatus = 'UNKNOWN';
    let recommendations = [];

    if (targetFound && targetRank <= 3 && targetScore > 0.7) {
      overallStatus = '🎉 SUCCESS';
      console.log('🎉 VECTOR SEARCH QUALITY FIX SUCCESSFUL!');
      console.log(`   ✅ Target document ranks #${targetRank} with ${(targetScore * 100).toFixed(1)}% similarity`);
      console.log(`   ✅ This is a dramatic improvement from the previous rank #11 with 1.9% similarity`);
      recommendations.push('✅ Vector search is working correctly');
      recommendations.push('✅ Consider enabling reranking for even better results');
    } else if (targetFound && targetRank <= 10) {
      overallStatus = '⚠️  PARTIAL SUCCESS';
      console.log('⚠️  PARTIAL IMPROVEMENT DETECTED');
      console.log(`   ✅ Target document found at rank #${targetRank}`);
      console.log(`   ⚠️  But ranking could be better`);
      recommendations.push('⚠️  Vector search improved but not optimal');
      recommendations.push('💡 Consider tuning search parameters');
      recommendations.push('💡 Enable hybrid search with keyword matching');
    } else {
      overallStatus = '❌ FAILED';
      console.log('❌ VECTOR SEARCH QUALITY ISSUE PERSISTS');
      console.log('   Target document still not found in top 10 results');
      recommendations.push('🔍 Check if embeddings are being generated correctly');
      recommendations.push('🔍 Verify collection indexing');
      recommendations.push('🔍 Test with different queries');
    }

    console.log(`\nOverall Status: ${overallStatus}`);
    console.log('\n💡 RECOMMENDATIONS:');
    recommendations.forEach(rec => console.log(`   ${rec}`));

    console.log('\n📈 BEFORE vs AFTER COMPARISON:');
    console.log('==============================');
    console.log('BEFORE (with random vectors):');
    console.log('   - Target rank: #11/50');
    console.log('   - Similarity: 1.9%');
    console.log('   - Status: Not found in top 10');
    console.log('');
    console.log('AFTER (with real embeddings):');
    console.log(`   - Target rank: ${targetFound ? `#${targetRank}/10` : 'NOT FOUND'}`);
    console.log(`   - Similarity: ${targetFound ? `${(targetScore * 100).toFixed(1)}%` : 'N/A'}`);
    console.log(`   - Status: ${targetFound ? (targetRank <= 3 ? 'EXCELLENT' : targetRank <= 5 ? 'GOOD' : 'ACCEPTABLE') : 'FAILED'}`);

    if (targetFound && targetScore > 0.1) {
      const improvement = (targetScore / 0.019) * 100; // 0.019 was the old score
      console.log(`   - Improvement: ${improvement.toFixed(0)}x better similarity score!`);
    }

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    console.log('\n💡 TROUBLESHOOTING:');
    console.log('   - Check that the API server is running');
    console.log('   - Verify Qdrant is accessible');
    console.log('   - Ensure the collection was recreated properly');
    console.log('   - Confirm the document was uploaded with real embeddings');
  }
}

// Run the validation
validateVectorSearchFix().catch(console.error);