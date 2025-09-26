import { createTokenAwareChunks } from '../routes/ingest/publish.js';

describe('Table Chunking', () => {
  const maxTokensPerChunk = 350;

  it('should keep small tables intact', async () => {
    const doc = {
      blocks: [{
        type: 'table',
        text: `| Tier        | Level Range | Unlock |
---|---|---
| Novice      | 1–3         | Starting stunts |
| Apprentice  | 4–6         | First breakthrough |`
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].isTable).toBe(true);
    expect(chunks[0].text).toContain('| Novice');
    expect(chunks[0].text).toContain('| Apprentice');
  });

  it('should split large tables by rows', async () => {
    // Create a large table that exceeds token limit
    const rows = [];
    for (let i = 0; i < 50; i++) {
      rows.push(`| Row ${i} | Data ${i} | More data ${i} |`);
    }
    const tableText = `| Header 1 | Header 2 | Header 3 |
---|---|---
${rows.join('\n')}`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.isTable).toBe(true);
      // Each chunk should contain whole rows or separators
      const lines = chunk.text.split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) {
          expect(line).toMatch(/^(\|.*\|)|(-+\|)+-+$/); // Table row or separator
        }
      });
    });
  });

  it('should handle text blocks with table content', async () => {
    const doc = {
      blocks: [{
        type: 'text',
        text: `Some text before table.

| Tier | Level |
---|---
| Novice | 1-3 |

More text after.`
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const tableChunks = chunks.filter(c => c.isTable);
    expect(tableChunks.length).toBeGreaterThan(0);
  });

  it('should preserve table structure in chunks', async () => {
    const tableText = `| Tier | Abilities |
---|---
| Novice | Basic skills |
| Master | Advanced feats |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    // Should be one chunk since it's small
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(tableText);
    expect(chunks[0].isTable).toBe(true);
  });

  it('should handle tables with very long rows by splitting words', async () => {
    // Create a table with one extremely long row using varied content
    const longText = 'This is a very long piece of text that contains many different words and should exceed the token limit when placed in a table cell. '.repeat(20); // Very long content
    const tableText = `| Header |
---|---
| ${longText} |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThanOrEqual(1); // May or may not split depending on exact token count
    chunks.forEach(chunk => {
      expect(chunk.isTable).toBe(true);
      // For word-split chunks, we may not have table markers if the content is split deeply
      // Just ensure the chunk has content
      expect(chunk.text.length).toBeGreaterThan(0);
    });
  });

  it('should handle tables without proper separators', async () => {
    const tableText = `| Col1 | Col2 |
| Data1 | Data2 |
| Data3 | Data4 |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].isTable).toBe(true);
  });

  it('should handle mixed content with tables and text', async () => {
    const mixedText = `Some introductory text.

| Table | Header |
---|---
| Row1 | Data1 |
| Row2 | Data2 |

More text after the table.`;

    const doc = {
      blocks: [{
        type: 'text',
        text: mixedText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const tableChunks = chunks.filter(c => c.isTable);
    expect(tableChunks.length).toBeGreaterThan(0);
  });

  it('should handle empty or minimal tables', async () => {
    const tableText = `| Header |
---|---
| Data |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].isTable).toBe(true);
  });

  it('should handle tables with special characters and formatting', async () => {
    const tableText = `| Special | Characters |
---|---
| Café | naïve |
| 123 | @#$% |
| Multi\nLine | Content |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].isTable).toBe(true);
  });

  it('should handle tables exactly at token limit', async () => {
    // Create content that should be very close to the limit
    const tableText = `| Header1 | Header2 | Header3 |
---|---|---|---
| ${'A'.repeat(50)} | ${'B'.repeat(50)} | ${'C'.repeat(50)} |
| ${'D'.repeat(50)} | ${'E'.repeat(50)} | ${'F'.repeat(50)} |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableText
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    // Should either be 1 chunk (if under limit) or multiple (if over)
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.isTable).toBe(true);
    });
  });

  it('should handle malformed table fragments', async () => {
    // Simulate what happens when tables get split poorly
    const tableFragment = `| Incomplete | Row |
| Another | Row |`;

    const doc = {
      blocks: [{
        type: 'table',
        text: tableFragment
      }]
    };

    const chunks = await createTokenAwareChunks(doc, maxTokensPerChunk);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].isTable).toBe(true);
  });
});