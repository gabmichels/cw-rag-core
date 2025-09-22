import { HybridSearchResult } from '@cw-rag-core/retrieval';
import { CitationMap } from '../types/synthesis.js';
export interface CitationService {
    /**
     * Extract citations from retrieved documents
     */
    extractCitations(documents: HybridSearchResult[], tenantId?: string): CitationMap;
    /**
     * Format text with inline citations
     */
    formatTextWithCitations(text: string, citations: CitationMap): string;
    /**
     * Validate that all citations in text exist in citation map
     */
    validateCitations(text: string, citations: CitationMap): boolean;
    /**
     * Generate citation bibliography in markdown format
     */
    generateBibliography(citations: CitationMap): string;
}
export declare class CitationServiceImpl implements CitationService {
    extractCitations(documents: HybridSearchResult[], tenantId?: string): CitationMap;
    formatTextWithCitations(text: string, citations: CitationMap): string;
    validateCitations(text: string, citations: CitationMap): boolean;
    generateBibliography(citations: CitationMap): string;
    private extractSourceFromDocument;
}
/**
 * Enhanced citation service with additional validation and formatting options
 */
export declare class EnhancedCitationService extends CitationServiceImpl {
    private readonly maxCitationsPerAnswer;
    private readonly minContentLengthForCitation;
    constructor(maxCitationsPerAnswer?: number, minContentLengthForCitation?: number);
    extractCitations(documents: HybridSearchResult[], tenantId?: string): CitationMap;
    /**
     * Generate citation stats for quality monitoring
     */
    getCitationStats(citations: CitationMap): {
        totalCitations: number;
        sourcesWithUrls: number;
        sourcesWithAuthors: number;
        sourcesWithVersions: number;
        sourcesWithFreshness: number;
        freshCount: number;
        recentCount: number;
        staleCount: number;
    };
    /**
     * Remove duplicate citations based on source
     */
    deduplicateCitations(citations: CitationMap): CitationMap;
}
/**
 * Factory function for creating citation service
 */
export declare function createCitationService(enhanced?: boolean): CitationService;
