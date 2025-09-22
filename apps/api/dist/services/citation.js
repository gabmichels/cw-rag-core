import { CitationExtractionError } from '../types/synthesis.js';
import { calculateFreshnessInfoSafe } from '@cw-rag-core/shared';
export class CitationServiceImpl {
    extractCitations(documents, tenantId) {
        const citations = {};
        documents.forEach((doc, index) => {
            try {
                const citationNumber = index + 1;
                const payload = doc.payload;
                if (!payload) {
                    throw new CitationExtractionError('Document payload is missing', doc.id);
                }
                // Extract source information
                const source = this.extractSourceFromDocument(doc);
                // Calculate freshness information
                const freshness = calculateFreshnessInfoSafe(payload.modifiedAt, tenantId, undefined, payload.createdAt);
                const citation = {
                    id: doc.id,
                    number: citationNumber,
                    source,
                    docId: payload.docId || doc.id,
                    version: payload.version,
                    url: payload.url,
                    filepath: payload.filepath,
                    authors: Array.isArray(payload.authors) ? payload.authors : undefined,
                    freshness
                };
                citations[citationNumber.toString()] = citation;
            }
            catch (error) {
                console.error(`Failed to extract citation for document ${doc.id}:`, error);
                // Continue processing other documents rather than failing completely
            }
        });
        return citations;
    }
    formatTextWithCitations(text, citations) {
        // This method assumes the LLM has already inserted citation markers
        // We validate that all cited sources exist in our citation map
        const citationPattern = /\[(\^?\d+)\]/g;
        let formattedText = text;
        // Find all citation references in the text
        const citationMatches = Array.from(text.matchAll(citationPattern));
        for (const match of citationMatches) {
            const fullMatch = match[0];
            const citationRef = match[1].replace('^', ''); // Remove ^ if present
            // Validate citation exists
            if (!citations[citationRef]) {
                console.warn(`Citation [${citationRef}] not found in citation map, removing from text`);
                formattedText = formattedText.replace(fullMatch, '');
                continue;
            }
            // Ensure proper markdown citation format
            const properFormat = `[^${citationRef}]`;
            if (fullMatch !== properFormat) {
                formattedText = formattedText.replace(fullMatch, properFormat);
            }
        }
        return formattedText.trim();
    }
    validateCitations(text, citations) {
        const citationPattern = /\[(\^?\d+)\]/g;
        const citationMatches = Array.from(text.matchAll(citationPattern));
        for (const match of citationMatches) {
            const citationRef = match[1].replace('^', '');
            if (!citations[citationRef]) {
                return false;
            }
        }
        return true;
    }
    generateBibliography(citations) {
        const sortedCitations = Object.values(citations)
            .sort((a, b) => a.number - b.number);
        if (sortedCitations.length === 0) {
            return '';
        }
        const bibliography = sortedCitations.map(citation => {
            let bibEntry = `[^${citation.number}]: `;
            // Format based on available metadata
            if (citation.authors && citation.authors.length > 0) {
                bibEntry += `${citation.authors.join(', ')}. `;
            }
            bibEntry += citation.source;
            if (citation.version) {
                bibEntry += ` (v${citation.version})`;
            }
            // Add freshness information
            if (citation.freshness) {
                bibEntry += ` ${citation.freshness.badge} (${citation.freshness.humanReadable})`;
            }
            if (citation.url) {
                bibEntry += ` - [${citation.url}](${citation.url})`;
            }
            else if (citation.filepath) {
                bibEntry += ` - ${citation.filepath}`;
            }
            return bibEntry;
        });
        return '\n\n## Sources\n\n' + bibliography.join('\n');
    }
    extractSourceFromDocument(doc) {
        const payload = doc.payload;
        // Try to extract a meaningful source name
        if (payload?.url) {
            try {
                const url = new URL(payload.url);
                return url.hostname + url.pathname;
            }
            catch {
                return payload.url;
            }
        }
        if (payload?.filepath) {
            // Extract filename from filepath
            const filename = payload.filepath.split(/[/\\]/).pop();
            return filename || payload.filepath;
        }
        if (payload?.docId) {
            return payload.docId;
        }
        // Fallback to document ID
        return doc.id;
    }
}
/**
 * Enhanced citation service with additional validation and formatting options
 */
export class EnhancedCitationService extends CitationServiceImpl {
    maxCitationsPerAnswer;
    minContentLengthForCitation;
    constructor(maxCitationsPerAnswer = 10, minContentLengthForCitation = 50) {
        super();
        this.maxCitationsPerAnswer = maxCitationsPerAnswer;
        this.minContentLengthForCitation = minContentLengthForCitation;
    }
    extractCitations(documents, tenantId) {
        // Filter documents that are too short to be useful citations
        const validDocuments = documents.filter(doc => {
            const content = doc.content || '';
            return content.length >= this.minContentLengthForCitation;
        });
        // Limit to maximum number of citations
        const limitedDocuments = validDocuments.slice(0, this.maxCitationsPerAnswer);
        return super.extractCitations(limitedDocuments, tenantId);
    }
    /**
     * Generate citation stats for quality monitoring
     */
    getCitationStats(citations) {
        const citationValues = Object.values(citations);
        return {
            totalCitations: citationValues.length,
            sourcesWithUrls: citationValues.filter(c => c.url).length,
            sourcesWithAuthors: citationValues.filter(c => c.authors && c.authors.length > 0).length,
            sourcesWithVersions: citationValues.filter(c => c.version).length,
            sourcesWithFreshness: citationValues.filter(c => c.freshness).length,
            freshCount: citationValues.filter(c => c.freshness?.category === 'Fresh').length,
            recentCount: citationValues.filter(c => c.freshness?.category === 'Recent').length,
            staleCount: citationValues.filter(c => c.freshness?.category === 'Stale').length
        };
    }
    /**
     * Remove duplicate citations based on source
     */
    deduplicateCitations(citations) {
        const seen = new Set();
        const deduplicated = {};
        let newNumber = 1;
        for (const citation of Object.values(citations).sort((a, b) => a.number - b.number)) {
            const sourceKey = citation.source.toLowerCase();
            if (!seen.has(sourceKey)) {
                seen.add(sourceKey);
                deduplicated[newNumber.toString()] = {
                    ...citation,
                    number: newNumber
                };
                newNumber++;
            }
        }
        return deduplicated;
    }
}
/**
 * Factory function for creating citation service
 */
export function createCitationService(enhanced = true) {
    return enhanced ? new EnhancedCitationService() : new CitationServiceImpl();
}
