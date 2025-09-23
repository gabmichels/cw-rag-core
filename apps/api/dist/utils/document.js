import crypto from 'crypto';
/**
 * Calculate SHA256 hash of document content
 */
export function calculateDocumentHash(doc) {
    // Combine all text content from blocks
    const combinedText = doc.blocks
        .map(block => (block.text || '') + (block.html || ''))
        .join('\n');
    // Include metadata that affects content identity
    const contentToHash = JSON.stringify({
        content: combinedText,
        tenant: doc.meta.tenant,
        docId: doc.meta.docId,
        source: doc.meta.source,
        path: doc.meta.path,
        title: doc.meta.title
    });
    return crypto.createHash('sha256').update(contentToHash, 'utf8').digest('hex');
}
/**
 * Extract all text content from document blocks for PII detection
 */
export function extractCombinedText(doc) {
    return doc.blocks
        .map(block => {
        const parts = [];
        if (block.text)
            parts.push(block.text);
        if (block.html)
            parts.push(block.html);
        return parts.join(' ');
    })
        .join('\n');
}
/**
 * Calculate document size in bytes
 */
export function calculateDocumentSize(doc) {
    const jsonString = JSON.stringify(doc);
    return Buffer.byteLength(jsonString, 'utf8');
}
/**
 * Count the number of blocks in a document
 */
export function countBlocks(doc) {
    return doc.blocks.length;
}
/**
 * Validate that required metadata fields are present
 */
export function validateDocumentMetadata(doc) {
    const errors = [];
    if (!doc.meta.tenant)
        errors.push('Missing tenant');
    if (!doc.meta.docId)
        errors.push('Missing docId');
    if (!doc.meta.source)
        errors.push('Missing source');
    if (!doc.meta.acl || doc.meta.acl.length === 0)
        errors.push('Missing or empty acl');
    if (!doc.meta.timestamp)
        errors.push('Missing timestamp');
    return errors;
}
/**
 * Apply PII redaction to document blocks
 */
export function applyPIIRedactionToDocument(doc, maskedText) {
    // For simplicity, we'll replace the combined text back into the first text block
    // In a production system, you'd want more sophisticated mapping
    const redactedBlocks = doc.blocks.map((block, index) => {
        if (index === 0 && block.type === 'text') {
            return {
                ...block,
                text: maskedText,
                html: undefined // Clear HTML to avoid inconsistency
            };
        }
        return block;
    });
    return {
        ...doc,
        blocks: redactedBlocks
    };
}
/**
 * Generate a unique point ID for Qdrant (UUID format)
 */
export function generatePointId(tenant, docId, chunkId) {
    // Generate a deterministic UUID v5 from the input
    const hash = crypto
        .createHash('sha256')
        .update(`${tenant}:${docId}:${chunkId}`)
        .digest('hex');
    // Format as UUID v4 (with proper dashes)
    return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        hash.substring(12, 16),
        hash.substring(16, 20),
        hash.substring(20, 32)
    ].join('-');
}
/**
 * Create chunk metadata payload for Qdrant
 */
export function createChunkPayload(doc, chunkId, sectionPath) {
    return {
        tenant: doc.meta.tenant,
        docId: doc.meta.docId,
        version: doc.meta.version || '1',
        sha256: doc.meta.sha256,
        acl: doc.meta.acl,
        lang: doc.meta.lang || 'en',
        source: doc.meta.source,
        path: doc.meta.path,
        title: doc.meta.title,
        timestamp: doc.meta.timestamp,
        modifiedAt: doc.meta.modifiedAt,
        chunkId,
        sectionPath,
        content: extractCombinedText(doc)
    };
}
