const { QdrantClient } = require('@qdrant/js-client-rest');

async function testQdrant() {
  const client = new QdrantClient({ url: 'http://localhost:6333' });

  try {
    const result = await client.scroll('docs_v1', {
      filter: {
        must: [
          { key: 'content', match: { text: '31 hours' } },
          { key: 'tenant', match: { value: 'zenithfall' } }
        ]
      },
      limit: 10,
      with_payload: true
    });

    console.log('Found chunks:', result.points.length);
    result.points.forEach((point, i) => {
      console.log(`Chunk ${i+1}: ID=${point.id}`);
      console.log(`Content preview: ${point.payload.content.substring(0, 200)}...`);
      console.log('---');
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testQdrant();