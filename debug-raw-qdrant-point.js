#!/usr/bin/env node

/**
 * Debug script to fetch raw Qdrant point structure
 */

const { QdrantClient } = require('@qdrant/js-client-rest');

async function debugRawQdrantPoint() {
  console.log('🔍 Debug: Fetching raw Qdrant point structure');
  console.log('='.repeat(50));

  try {
    // Initialize Qdrant client
    const client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
    });

    // First, get a few points to see the structure
    console.log('📡 Fetching sample points from docs_v1 collection...');

    const scrollResult = await client.scroll('docs_v1', {
      limit: 5,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          {
            key: 'tenantId',
            match: { value: 'zenithfall' }
          },
          {
            key: 'docId',
            match: { value: 'Skill Tables' }
          }
        ]
      }
    });

    console.log(`📋 Found ${scrollResult.points.length} skill table points`);

    scrollResult.points.forEach((point, index) => {
      console.log(`\n🔍 RAW POINT ${index + 1}:`);
      console.log(`  ID: ${point.id}`);
      console.log(`  Payload Keys: ${Object.keys(point.payload || {}).join(', ')}`);
      console.log(`  FULL RAW PAYLOAD:`, JSON.stringify(point.payload, null, 2));

      // Specifically look for sectionPath variants
      if (point.payload) {
        console.log(`  SectionPath Found: ${point.payload.sectionPath || 'NOT FOUND'}`);
        console.log(`  Section_Path Found: ${point.payload.section_path || 'NOT FOUND'}`);
        console.log(`  Block_Path Found: ${point.payload.blockPath || 'NOT FOUND'}`);
        console.log(`  Chunk_Path Found: ${point.payload.chunkPath || 'NOT FOUND'}`);
      }

      // Show content preview to confirm it's skill table content
      const content = point.payload?.content || '';
      console.log(`  Content Preview: ${content.substring(0, 150)}...`);
    });

    // Also try to get the specific target point we're looking for
    console.log('\n🎯 Trying to fetch the specific target point...');
    try {
      const targetPoint = await client.retrieve('docs_v1', {
        ids: ['69fbb454-b310-59b0-e53c-6ab7d4909bfe'],
        with_payload: true,
        with_vector: false
      });

      if (targetPoint.length > 0) {
        const point = targetPoint[0];
        console.log('\n🎯 TARGET POINT STRUCTURE:');
        console.log(`  ID: ${point.id}`);
        console.log(`  FULL RAW PAYLOAD:`, JSON.stringify(point.payload, null, 2));
      }
    } catch (error) {
      console.log('❌ Could not fetch target point:', error.message);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugRawQdrantPoint().catch(console.error);