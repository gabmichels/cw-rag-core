/**
 * Freshness calculation utilities for document metadata
 * Provides time-based relevance indicators for retrieved documents
 */
export type FreshnessCategory = 'Fresh' | 'Recent' | 'Stale';
export interface FreshnessInfo {
    category: FreshnessCategory;
    badge: string;
    ageInDays: number;
    humanReadable: string;
    timestamp: string;
}
export interface FreshnessThresholds {
    freshDays: number;
    recentDays: number;
}
export interface FreshnessConfig {
    thresholds: FreshnessThresholds;
    timezone?: string;
}
export declare const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds;
/**
 * Set custom freshness thresholds for a specific tenant
 */
export declare function setTenantFreshnessConfig(tenantId: string, config: FreshnessConfig): void;
/**
 * Get freshness thresholds for a specific tenant
 */
export declare function getTenantFreshnessThresholds(tenantId?: string): FreshnessThresholds;
/**
 * Calculate the age of a document in days
 */
export declare function calculateDocumentAge(modifiedAt: string, currentTime?: Date): number;
/**
 * Determine freshness category based on age and thresholds
 */
export declare function categorizeFreshness(ageInDays: number, thresholds?: FreshnessThresholds): FreshnessCategory;
/**
 * Generate freshness badge text
 */
export declare function generateFreshnessBadge(category: FreshnessCategory): string;
/**
 * Format age in human-readable form
 */
export declare function formatHumanReadableAge(ageInDays: number): string;
/**
 * Calculate complete freshness information for a document
 */
export declare function calculateFreshnessInfo(modifiedAt: string, tenantId?: string, currentTime?: Date, createdAt?: string): FreshnessInfo;
/**
 * Calculate freshness statistics for a collection of documents
 */
export interface FreshnessStats {
    totalDocuments: number;
    freshCount: number;
    recentCount: number;
    staleCount: number;
    freshPercentage: number;
    recentPercentage: number;
    stalePercentage: number;
    averageAge: number;
}
export declare function calculateFreshnessStats(documents: Array<{
    modifiedAt?: string;
    createdAt?: string;
}>, tenantId?: string, currentTime?: Date): FreshnessStats;
/**
 * Safe freshness calculation that handles missing timestamps gracefully
 */
export declare function calculateFreshnessInfoSafe(modifiedAt?: string, tenantId?: string, currentTime?: Date, createdAt?: string): FreshnessInfo | null;
