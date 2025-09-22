import {
  calculateDocumentAge,
  categorizeFreshness,
  generateFreshnessBadge,
  formatHumanReadableAge,
  calculateFreshnessInfo,
  calculateFreshnessStats,
  setTenantFreshnessConfig,
  getTenantFreshnessThresholds,
  DEFAULT_FRESHNESS_THRESHOLDS,
  FreshnessThresholds
} from '../utils/freshness.js';

describe('Freshness Utilities', () => {
  const testTime = new Date('2023-06-15T12:00:00.000Z');

  describe('calculateDocumentAge', () => {
    it('should calculate age in days correctly', () => {
      const modifiedAt = '2023-06-10T12:00:00.000Z'; // 5 days ago
      const age = calculateDocumentAge(modifiedAt, testTime);
      expect(age).toBe(5);
    });

    it('should handle same day documents', () => {
      const modifiedAt = '2023-06-15T08:00:00.000Z'; // Same day, earlier time
      const age = calculateDocumentAge(modifiedAt, testTime);
      expect(age).toBe(0);
    });

    it('should throw error for invalid timestamp', () => {
      expect(() => calculateDocumentAge('invalid-date', testTime)).toThrow();
    });

    it('should use current time if not provided', () => {
      const recentTime = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      const age = calculateDocumentAge(recentTime);
      expect(age).toBe(1);
    });
  });

  describe('categorizeFreshness', () => {
    const thresholds: FreshnessThresholds = { freshDays: 7, recentDays: 30 };

    it('should categorize as Fresh for documents within fresh threshold', () => {
      expect(categorizeFreshness(3, thresholds)).toBe('Fresh');
      expect(categorizeFreshness(7, thresholds)).toBe('Fresh');
    });

    it('should categorize as Recent for documents within recent threshold', () => {
      expect(categorizeFreshness(15, thresholds)).toBe('Recent');
      expect(categorizeFreshness(30, thresholds)).toBe('Recent');
    });

    it('should categorize as Stale for old documents', () => {
      expect(categorizeFreshness(45, thresholds)).toBe('Stale');
      expect(categorizeFreshness(365, thresholds)).toBe('Stale');
    });

    it('should use default thresholds when not provided', () => {
      expect(categorizeFreshness(5)).toBe('Fresh');
      expect(categorizeFreshness(20)).toBe('Recent');
      expect(categorizeFreshness(60)).toBe('Stale');
    });
  });

  describe('generateFreshnessBadge', () => {
    it('should generate correct badge for each category', () => {
      expect(generateFreshnessBadge('Fresh')).toBe('🟢 Fresh');
      expect(generateFreshnessBadge('Recent')).toBe('🟡 Recent');
      expect(generateFreshnessBadge('Stale')).toBe('🔴 Stale');
    });
  });

  describe('formatHumanReadableAge', () => {
    it('should format days correctly', () => {
      expect(formatHumanReadableAge(0)).toBe('today');
      expect(formatHumanReadableAge(1)).toBe('1 day ago');
      expect(formatHumanReadableAge(3)).toBe('3 days ago');
    });

    it('should format weeks correctly', () => {
      expect(formatHumanReadableAge(7)).toBe('1 week ago');
      expect(formatHumanReadableAge(14)).toBe('2 weeks ago');
      expect(formatHumanReadableAge(21)).toBe('3 weeks ago');
    });

    it('should format months correctly', () => {
      expect(formatHumanReadableAge(30)).toBe('1 month ago');
      expect(formatHumanReadableAge(60)).toBe('2 months ago');
      expect(formatHumanReadableAge(120)).toBe('4 months ago');
    });

    it('should format years correctly', () => {
      expect(formatHumanReadableAge(365)).toBe('1 year ago');
      expect(formatHumanReadableAge(730)).toBe('2 years ago');
    });
  });

  describe('calculateFreshnessInfo', () => {
    it('should calculate complete freshness info', () => {
      const modifiedAt = '2023-06-10T12:00:00.000Z'; // 5 days ago
      const info = calculateFreshnessInfo(modifiedAt, undefined, testTime);

      expect(info.ageInDays).toBe(5);
      expect(info.category).toBe('Fresh');
      expect(info.badge).toBe('🟢 Fresh');
      expect(info.humanReadable).toBe('5 days ago');
      expect(info.timestamp).toBe(modifiedAt);
    });

    it('should use createdAt as fallback', () => {
      const createdAt = '2023-06-05T12:00:00.000Z'; // 10 days ago
      const info = calculateFreshnessInfo(undefined as any, undefined, testTime, createdAt);

      expect(info.ageInDays).toBe(10);
      expect(info.timestamp).toBe(createdAt);
    });

    it('should throw error when no timestamp provided', () => {
      expect(() => calculateFreshnessInfo(undefined as any, undefined, testTime)).toThrow();
    });

    it('should use tenant-specific thresholds', () => {
      const tenantThresholds: FreshnessThresholds = { freshDays: 3, recentDays: 10 };
      setTenantFreshnessConfig('test-tenant', { thresholds: tenantThresholds });

      const modifiedAt = '2023-06-10T12:00:00.000Z'; // 5 days ago
      const info = calculateFreshnessInfo(modifiedAt, 'test-tenant', testTime);

      expect(info.category).toBe('Recent'); // Would be Fresh with default thresholds
    });
  });

  describe('calculateFreshnessStats', () => {
    const documents = [
      { modifiedAt: '2023-06-13T12:00:00.000Z' }, // 2 days ago - Fresh
      { modifiedAt: '2023-06-05T12:00:00.000Z' }, // 10 days ago - Recent
      { modifiedAt: '2023-05-01T12:00:00.000Z' }, // 45 days ago - Stale
      { modifiedAt: '2023-06-14T12:00:00.000Z' }, // 1 day ago - Fresh
      { createdAt: '2023-04-01T12:00:00.000Z' },   // 75 days ago - Stale
    ];

    it('should calculate correct statistics', () => {
      const stats = calculateFreshnessStats(documents, undefined, testTime);

      expect(stats.totalDocuments).toBe(5);
      expect(stats.freshCount).toBe(2);
      expect(stats.recentCount).toBe(1);
      expect(stats.staleCount).toBe(2);
      expect(stats.freshPercentage).toBe(40);
      expect(stats.recentPercentage).toBe(20);
      expect(stats.stalePercentage).toBe(40);
      expect(stats.averageAge).toBeGreaterThan(0);
    });

    it('should handle empty document list', () => {
      const stats = calculateFreshnessStats([], undefined, testTime);

      expect(stats.totalDocuments).toBe(0);
      expect(stats.freshCount).toBe(0);
      expect(stats.recentCount).toBe(0);
      expect(stats.staleCount).toBe(0);
      expect(stats.freshPercentage).toBe(0);
      expect(stats.recentPercentage).toBe(0);
      expect(stats.stalePercentage).toBe(0);
      expect(stats.averageAge).toBe(0);
    });

    it('should skip documents with invalid timestamps', () => {
      const docsWithInvalid = [
        { modifiedAt: '2023-06-13T12:00:00.000Z' }, // 2 days ago - Fresh
        { modifiedAt: 'invalid-date' },
        {},
        { modifiedAt: '2023-06-05T12:00:00.000Z' }, // 10 days ago - Recent
      ];

      const stats = calculateFreshnessStats(docsWithInvalid, undefined, testTime);
      expect(stats.totalDocuments).toBe(2); // Only valid timestamps
    });
  });

  describe('tenant configuration', () => {
    it('should set and get tenant-specific thresholds', () => {
      const customThresholds: FreshnessThresholds = { freshDays: 14, recentDays: 60 };
      setTenantFreshnessConfig('custom-tenant', { thresholds: customThresholds });

      const retrieved = getTenantFreshnessThresholds('custom-tenant');
      expect(retrieved).toEqual(customThresholds);
    });

    it('should return default thresholds for unknown tenant', () => {
      const retrieved = getTenantFreshnessThresholds('unknown-tenant');
      expect(retrieved).toEqual(DEFAULT_FRESHNESS_THRESHOLDS);
    });

    it('should return default thresholds when no tenant specified', () => {
      const retrieved = getTenantFreshnessThresholds();
      expect(retrieved).toEqual(DEFAULT_FRESHNESS_THRESHOLDS);
    });
  });

  describe('edge cases', () => {
    it('should handle future timestamps gracefully', () => {
      const futureTime = '2023-06-20T12:00:00.000Z'; // 5 days in future
      const age = calculateDocumentAge(futureTime, testTime);
      expect(age).toBe(-5); // Negative age for future dates
    });

    it('should handle very large age values', () => {
      const veryOldTime = '1990-01-01T12:00:00.000Z';
      const age = calculateDocumentAge(veryOldTime, testTime);
      expect(age).toBeGreaterThan(10000); // Many days ago

      const formatted = formatHumanReadableAge(age);
      expect(formatted).toContain('years ago');
    });

    it('should handle zero and negative ages in formatting', () => {
      expect(formatHumanReadableAge(0)).toBe('today');
      expect(formatHumanReadableAge(-1)).toBe('today'); // Negative treated as today
    });
  });

  describe('performance', () => {
    it('should handle large document collections efficiently', () => {
      const largeDocSet = Array.from({ length: 1000 }, (_, i) => ({
        modifiedAt: new Date(testTime.getTime() - i * 86400000).toISOString()
      }));

      const start = Date.now();
      const stats = calculateFreshnessStats(largeDocSet, undefined, testTime);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
      expect(stats.totalDocuments).toBe(1000);
    });
  });
});