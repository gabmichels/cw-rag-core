import * as fs from 'fs';
import * as path from 'path';
import {
  loadCorpusStats,
  saveCorpusStats,
  updateCorpusStats,
  tokenizeAndNormalize,
  isStopword,
  serializeCorpusStats,
  deserializeCorpusStats,
  cachedStats,
  cacheTimestamps,
  CorpusStats
} from '../src/stats/corpus-stats.js';

// Mock fs
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('CorpusStats', () => {
  const tenant = 'test-tenant';
  const statsFile = path.join(process.cwd(), 'data', `corpus-stats-${tenant}.json`);

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    // Clear caches
    cachedStats.clear();
    cacheTimestamps.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadCorpusStats', () => {
    it('should return cached stats if valid', () => {
      const mockStats: CorpusStats = {
        idf: new Map([['test', 1.0]]),
        cooc: new Map(),
        pmi: new Map(),
        totalDocs: 10,
        totalTokens: 100
      };

      // Pre-populate cache
      const statsModule = require('../src/stats/corpus-stats.js');
      statsModule.cachedStats.set(tenant, mockStats);
      statsModule.cacheTimestamps.set(tenant, Date.now());

      const result = loadCorpusStats(tenant);

      expect(result).toBe(mockStats);
      expect(mockedFs.existsSync).not.toHaveBeenCalled();
    });

    it('should load and deserialize stats from file if not cached', () => {
      const fileData = {
        idf: { 'test': 1.0 },
        cooc: {},
        pmi: {},
        totalDocs: 10,
        totalTokens: 100
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(fileData));

      const result = loadCorpusStats(tenant);

      expect(mockedFs.existsSync).toHaveBeenCalledWith(statsFile);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(statsFile, 'utf-8');
      expect(result.idf.get('test')).toBe(1.0);
      expect(result.totalDocs).toBe(10);
    });

    it('should return empty stats if file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = loadCorpusStats(tenant);

      expect(result.idf.size).toBe(0);
      expect(result.totalDocs).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('should handle file read errors gracefully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = loadCorpusStats(tenant);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Failed to load corpus stats for tenant ${tenant} from disk:`,
        expect.any(Error)
      );
      expect(result.idf.size).toBe(0);
    });
  });

  describe('saveCorpusStats', () => {
    it('should serialize and save stats to file', () => {
      const mockStats: CorpusStats = {
        idf: new Map([['test', 1.0]]),
        cooc: new Map([['word1', new Map([['word2', 2]])]]),
        pmi: new Map([['word1', new Map([['word2', 0.5]])]]),
        totalDocs: 10,
        totalTokens: 100
      };

      mockedFs.existsSync.mockReturnValue(false); // Directory doesn't exist
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation();
      const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation();

      saveCorpusStats(mockStats, tenant);

      expect(mkdirSpy).toHaveBeenCalledWith(path.dirname(statsFile), { recursive: true });
      expect(writeSpy).toHaveBeenCalledWith(statsFile, expect.any(String));

      const writtenData = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(writtenData.idf.test).toBe(1.0);
      expect(writtenData.totalDocs).toBe(10);
    });

    it('should handle save errors gracefully', () => {
      const mockStats: CorpusStats = {
        idf: new Map(),
        cooc: new Map(),
        pmi: new Map(),
        totalDocs: 0,
        totalTokens: 0
      };

      mockedFs.existsSync.mockReturnValue(false); // Directory doesn't exist
      mockedFs.mkdirSync.mockImplementation(() => {
        throw new Error('Directory creation error');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      saveCorpusStats(mockStats, tenant);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to save corpus stats for tenant ${tenant}:`,
        expect.any(Error)
      );
    });
  });

  describe('updateCorpusStats', () => {
    it('should process documents and update statistics', () => {
      const documents = [
        { content: 'This is a test document.', id: 'doc1' },
        { content: 'Another test document here.', id: 'doc2' }
      ];

      const result = updateCorpusStats(documents, tenant);

      expect(result.totalDocs).toBe(2);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.idf.size).toBeGreaterThan(0);
    });

    it('should merge with existing statistics', () => {
      const existingStats: CorpusStats = {
        idf: new Map([['existing', 1.0]]),
        cooc: new Map([['existing', new Map([['word', 1]])]]),
        pmi: new Map(),
        totalDocs: 5,
        totalTokens: 50
      };

      // Pre-populate cache with existing stats
      cachedStats.set(tenant, existingStats);
      cacheTimestamps.set(tenant, Date.now());

      const documents = [{ content: 'New document content.', id: 'doc3' }];

      const result = updateCorpusStats(documents, tenant);

      expect(result.totalDocs).toBe(6); // 5 + 1
      expect(result.totalTokens).toBeGreaterThan(50);
    });

    it('should compute IDF correctly', () => {
      const documents = [
        { content: 'unique word document', id: 'doc1' },
        { content: 'another unique word', id: 'doc2' },
        { content: 'third document', id: 'doc3' }
      ];

      const result = updateCorpusStats(documents, tenant);

      // 'unique' appears in 2 out of 3 docs
      const expectedIdf = Math.log((3 + 1) / (2 + 1)) + 1;
      expect(result.idf.get('unique')).toBeCloseTo(expectedIdf);
    });
  });

  describe('tokenizeAndNormalize', () => {
    it('should tokenize and normalize text', () => {
      const text = 'Hello, World! This is a TEST.';
      const tokens = tokenizeAndNormalize(text);

      expect(tokens).toEqual(['hello', 'world', 'test']);
    });

    it('should filter out short tokens and stopwords', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const tokens = tokenizeAndNormalize(text);

      expect(tokens).not.toContain('the');
      expect(tokens).toContain('over'); // 'over' is not a stopword
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('should handle empty and whitespace-only text', () => {
      expect(tokenizeAndNormalize('')).toEqual([]);
      expect(tokenizeAndNormalize('   ')).toEqual([]);
      expect(tokenizeAndNormalize('\t\n')).toEqual([]);
    });
  });

  describe('isStopword', () => {
    it('should identify common stopwords', () => {
      expect(isStopword('the')).toBe(true);
      expect(isStopword('and')).toBe(true);
      expect(isStopword('is')).toBe(true);
      expect(isStopword('of')).toBe(true);
    });

    it('should not identify non-stopwords', () => {
      expect(isStopword('hello')).toBe(false);
      expect(isStopword('world')).toBe(false);
      expect(isStopword('computer')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isStopword('The')).toBe(false);
      expect(isStopword('THE')).toBe(false);
    });
  });

  describe('serializeCorpusStats and deserializeCorpusStats', () => {
    it('should round-trip serialize and deserialize correctly', () => {
      const originalStats: CorpusStats = {
        idf: new Map([['test', 1.5], ['word', 2.0]]),
        cooc: new Map([
          ['test', new Map([['word', 3], ['other', 1]])],
          ['word', new Map([['test', 3], ['other', 2]])]
        ]),
        pmi: new Map([
          ['test', new Map([['word', 0.8], ['other', 0.3]])]
        ]),
        totalDocs: 42,
        totalTokens: 1337
      };

      const serialized = serializeCorpusStats(originalStats);
      const deserialized = deserializeCorpusStats(serialized);

      expect(deserialized.totalDocs).toBe(originalStats.totalDocs);
      expect(deserialized.totalTokens).toBe(originalStats.totalTokens);
      expect(deserialized.idf.get('test')).toBe(originalStats.idf.get('test'));
      expect(deserialized.cooc.get('test')!.get('word')).toBe(originalStats.cooc.get('test')!.get('word'));
      expect(deserialized.pmi.get('test')!.get('word')).toBe(originalStats.pmi.get('test')!.get('word'));
    });

    it('should handle empty stats', () => {
      const emptyStats: CorpusStats = {
        idf: new Map(),
        cooc: new Map(),
        pmi: new Map(),
        totalDocs: 0,
        totalTokens: 0
      };

      const serialized = serializeCorpusStats(emptyStats);
      const deserialized = deserializeCorpusStats(serialized);

      expect(deserialized.totalDocs).toBe(0);
      expect(deserialized.totalTokens).toBe(0);
      expect(deserialized.idf.size).toBe(0);
      expect(deserialized.cooc.size).toBe(0);
      expect(deserialized.pmi.size).toBe(0);
    });
  });

  describe('cache behavior', () => {
    it('should expire cache after TTL', () => {
      const mockStats: CorpusStats = {
        idf: new Map([['cached', 1.0]]),
        cooc: new Map(),
        pmi: new Map(),
        totalDocs: 1,
        totalTokens: 10
      };

      const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

      // Set cache with old timestamp
      cachedStats.set(tenant, mockStats);
      cacheTimestamps.set(tenant, Date.now() - CACHE_TTL - 1000);

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({
        idf: { 'fresh': 2.0 },
        cooc: {},
        pmi: {},
        totalDocs: 2,
        totalTokens: 20
      }));

      const result = loadCorpusStats(tenant);

      expect(result.idf.get('fresh')).toBe(2.0);
      expect(result.idf.has('cached')).toBe(false);
    });

    it('should update cache when saving stats', () => {
      const stats: CorpusStats = {
        idf: new Map([['updated', 3.0]]),
        cooc: new Map(),
        pmi: new Map(),
        totalDocs: 3,
        totalTokens: 30
      };

      saveCorpusStats(stats, tenant);

      expect(cachedStats.get(tenant)).toBe(stats);
      expect(cacheTimestamps.get(tenant)).toBeDefined();
    });
  });
});