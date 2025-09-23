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

// Default freshness thresholds
export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  freshDays: 7,
  recentDays: 30
};

// Tenant-specific freshness configurations
const tenantFreshnessConfigs = new Map<string, FreshnessConfig>();

/**
 * Set custom freshness thresholds for a specific tenant
 */
export function setTenantFreshnessConfig(tenantId: string, config: FreshnessConfig): void {
  tenantFreshnessConfigs.set(tenantId, config);
}

/**
 * Get freshness thresholds for a specific tenant
 */
export function getTenantFreshnessThresholds(tenantId?: string): FreshnessThresholds {
  if (tenantId && tenantFreshnessConfigs.has(tenantId)) {
    return tenantFreshnessConfigs.get(tenantId)!.thresholds;
  }
  return DEFAULT_FRESHNESS_THRESHOLDS;
}

/**
 * Calculate the age of a document in days
 */
export function calculateDocumentAge(modifiedAt: string, currentTime?: Date): number {
  const current = currentTime || new Date();
  const modified = new Date(modifiedAt);

  if (isNaN(modified.getTime())) {
    throw new Error(`Invalid modifiedAt timestamp: ${modifiedAt}`);
  }

  const diffInMs = current.getTime() - modified.getTime();
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine freshness category based on age and thresholds
 */
export function categorizeFreshness(
  ageInDays: number,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS
): FreshnessCategory {
  if (ageInDays <= thresholds.freshDays) {
    return 'Fresh';
  } else if (ageInDays <= thresholds.recentDays) {
    return 'Recent';
  } else {
    return 'Stale';
  }
}

/**
 * Generate freshness badge text
 */
export function generateFreshnessBadge(category: FreshnessCategory): string {
  switch (category) {
    case 'Fresh':
      return '🟢 Fresh';
    case 'Recent':
      return '🟡 Recent';
    case 'Stale':
      return '🔴 Stale';
    default:
      return '⚪ Unknown';
  }
}

/**
 * Format age in human-readable form
 */
export function formatHumanReadableAge(ageInDays: number): string {
  // Handle negative ages (future dates) and zero as "today"
  if (ageInDays <= 0) {
    return 'today';
  } else if (ageInDays === 1) {
    return '1 day ago';
  } else if (ageInDays < 7) {
    return `${ageInDays} days ago`;
  } else if (ageInDays < 14) {
    return '1 week ago';
  } else if (ageInDays < 30) {
    const weeks = Math.floor(ageInDays / 7);
    return `${weeks} weeks ago`;
  } else if (ageInDays < 60) {
    return '1 month ago';
  } else if (ageInDays < 365) {
    const months = Math.floor(ageInDays / 30);
    return `${months} months ago`;
  } else {
    const years = Math.floor(ageInDays / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
}

/**
 * Calculate complete freshness information for a document
 */
export function calculateFreshnessInfo(
  modifiedAt: string,
  tenantId?: string,
  currentTime?: Date,
  createdAt?: string
): FreshnessInfo {
  // Use modifiedAt if available, otherwise fall back to createdAt
  const timestamp = modifiedAt || createdAt;

  if (!timestamp) {
    throw new Error('No timestamp available for freshness calculation');
  }

  const thresholds = getTenantFreshnessThresholds(tenantId);
  const ageInDays = calculateDocumentAge(timestamp, currentTime);
  const category = categorizeFreshness(ageInDays, thresholds);
  const badge = generateFreshnessBadge(category);
  const humanReadable = formatHumanReadableAge(ageInDays);

  return {
    category,
    badge,
    ageInDays,
    humanReadable,
    timestamp
  };
}

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
  avgAgeInDays: number; // Renamed from averageAge
}

export function calculateFreshnessStats(
  documents: Array<{ modifiedAt?: string; createdAt?: string }>,
  tenantId?: string,
  currentTime?: Date
): FreshnessStats {
  if (documents.length === 0) {
    return {
      totalDocuments: 0,
      freshCount: 0,
      recentCount: 0,
      staleCount: 0,
      freshPercentage: 0,
      recentPercentage: 0,
      stalePercentage: 0,
      avgAgeInDays: 0 // Renamed from averageAge
    };
  }

  const thresholds = getTenantFreshnessThresholds(tenantId);
  let freshCount = 0;
  let recentCount = 0;
  let staleCount = 0;
  let totalAge = 0;
  let validDocuments = 0;

  for (const doc of documents) {
    const timestamp = doc.modifiedAt || doc.createdAt;
    if (!timestamp) continue;

    try {
      const ageInDays = calculateDocumentAge(timestamp, currentTime);
      const category = categorizeFreshness(ageInDays, thresholds);

      totalAge += ageInDays;
      validDocuments++;

      switch (category) {
        case 'Fresh':
          freshCount++;
          break;
        case 'Recent':
          recentCount++;
          break;
        case 'Stale':
          staleCount++;
          break;
      }
    } catch (error) {
      // Skip documents with invalid timestamps
      continue;
    }
  }

  const totalDocuments = validDocuments;
  const avgAgeInDays = totalDocuments > 0 ? totalAge / totalDocuments : 0; // Renamed for consistency

  return {
    totalDocuments,
    freshCount,
    recentCount,
    staleCount,
    freshPercentage: totalDocuments > 0 ? (freshCount / totalDocuments) * 100 : 0,
    recentPercentage: totalDocuments > 0 ? (recentCount / totalDocuments) * 100 : 0,
    stalePercentage: totalDocuments > 0 ? (staleCount / totalDocuments) * 100 : 0,
    avgAgeInDays // Renamed for consistency
  };
}

/**
 * Safe freshness calculation that handles missing timestamps gracefully
 */
export function calculateFreshnessInfoSafe(
  modifiedAt?: string,
  tenantId?: string,
  currentTime?: Date,
  createdAt?: string
): FreshnessInfo | null {
  try {
    const timestamp = modifiedAt || createdAt;
    if (!timestamp) {
      return null;
    }
    return calculateFreshnessInfo(timestamp, tenantId, currentTime);
  } catch (error) {
    console.warn('Failed to calculate freshness info:', error);
    return null;
  }
}