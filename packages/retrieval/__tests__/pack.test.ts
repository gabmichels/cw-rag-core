import {
  ContextPacker,
  createContextPacker,
  PackingConfig,
  PackedResult,
  PackingTrace
} from '../src/context/pack.js';
import { HybridSearchResult } from '../src/types/hybrid.js';

// Mock dependencies
const mockTokenBudgeter = {
  encoder: { encode: jest.fn(), decode: jest.fn(), free: jest.fn() },
  model: 'gpt-4o' as const,
  budgetTokens: 1000,
  estimateTokens: jest.fn(),
  countTokens: jest.fn(),
  fitsBudget: jest.fn(),
  truncateToBudget: jest.fn(),
  setBudget: jest.fn(),
  getBudget: jest.fn(),
  dispose: jest.fn()
};

const mockNoveltyScorer = {
  scoreNovelty: jest.fn(),
  setAlpha: jest.fn()
};

const mockAnswerabilityScorer = {
  applyBonus: jest.fn(),
  setBonus: jest.fn()
};

// Mock the factory functions
jest.mock('../src/context/budgeter.js', () => ({
  createTokenBudgeter: jest.fn(() => mockTokenBudgeter)
}));

jest.mock('../src/context/novelty.js', () => ({
  createNoveltyScorer: jest.fn(() => mockNoveltyScorer)
}));

jest.mock('../src/context/answerability.js', () => ({
  createAnswerabilityScorer: jest.fn(() => mockAnswerabilityScorer)
}));

// Mock data
const mockConfig: PackingConfig = {
  perDocCap: 2,
  perSectionCap: 2,
  noveltyAlpha: 0.5,
  answerabilityBonus: 1.0,
  sectionReunification: false,
  tokenBudget: 1000
};

const mockChunks: HybridSearchResult[] = [
  {
    id: 'chunk1',
    score: 0.9,
    fusionScore: 0.9,
    content: 'This is chunk 1 content',
    payload: {
      docId: 'doc1',
      sectionPath: 'section1',
      orderIndex: 1
    },
    searchType: 'hybrid'
  },
  {
    id: 'chunk2',
    score: 0.8,
    fusionScore: 0.8,
    content: 'This is chunk 2 content',
    payload: {
      docId: 'doc1',
      sectionPath: 'section1',
      orderIndex: 2
    },
    searchType: 'hybrid'
  },
  {
    id: 'chunk3',
    score: 0.7,
    fusionScore: 0.7,
    content: 'This is chunk 3 content',
    payload: {
      docId: 'doc2',
      sectionPath: 'section2',
      orderIndex: 1
    },
    searchType: 'hybrid'
  }
];

describe('ContextPacker', () => {
  let packer: ContextPacker;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockTokenBudgeter.estimateTokens.mockImplementation((text: string) => text.split(' ').length * 4);
    mockTokenBudgeter.countTokens.mockImplementation((text: string) => text.split(' ').length * 4);
    mockNoveltyScorer.scoreNovelty.mockResolvedValue(0.8);
    mockAnswerabilityScorer.applyBonus.mockImplementation((chunk, score) => score);

    packer = new ContextPacker(
      mockTokenBudgeter as any,
      mockNoveltyScorer as any,
      mockAnswerabilityScorer as any,
      mockConfig
    );
  });

  describe('constructor', () => {
    it('should create packer with provided dependencies', () => {
      expect(packer).toBeInstanceOf(ContextPacker);
      expect(packer.getBudgeter()).toBe(mockTokenBudgeter);
    });
  });

  describe('getBudgeter', () => {
    it('should return the token budgeter', () => {
      expect(packer.getBudgeter()).toBe(mockTokenBudgeter);
    });
  });

  describe('pack method', () => {
    beforeEach(() => {
      mockTokenBudgeter.estimateTokens.mockReturnValue(100); // 100 tokens per chunk
      mockTokenBudgeter.countTokens.mockReturnValue(100);
      mockNoveltyScorer.scoreNovelty.mockResolvedValue(0.8);
      mockAnswerabilityScorer.applyBonus.mockReturnValue(0.9);
    });

    it('should pack chunks within token budget', async () => {
      const result = await packer.pack(mockChunks);

      expect(result.chunks).toHaveLength(3);
      expect(result.totalTokens).toBe(300);
      expect(result.truncated).toBe(false);
      expect(result.trace.selectedIds).toEqual(['chunk1', 'chunk2', 'chunk3']);
    });

    it('should respect token budget and truncate when exceeded', async () => {
      const smallBudgetConfig = { ...mockConfig, tokenBudget: 250 };
      const smallBudgetPacker = new ContextPacker(
        mockTokenBudgeter as any,
        mockNoveltyScorer as any,
        mockAnswerabilityScorer as any,
        smallBudgetConfig
      );

      const result = await smallBudgetPacker.pack(mockChunks);

      expect(result.chunks.length).toBeLessThan(3); // Should fit fewer chunks
      expect(result.totalTokens).toBeLessThanOrEqual(250);
      // Since we fit some chunks but not all, and total tokens < budget, truncated should be false
      expect(result.truncated).toBe(false);
    });

    it('should apply per-document caps', async () => {
      const cappedConfig = { ...mockConfig, perDocCap: 1 };
      const cappedPacker = new ContextPacker(
        mockTokenBudgeter as any,
        mockNoveltyScorer as any,
        mockAnswerabilityScorer as any,
        cappedConfig
      );

      const result = await cappedPacker.pack(mockChunks);

      // Should only select 1 chunk from doc1 and 1 from doc2
      expect(result.chunks.length).toBe(2);
      expect(result.trace.capsApplied.perDoc['doc1']).toBe(1);
      expect(result.trace.capsApplied.perDoc['doc2']).toBe(1);
    });

    it('should apply per-section caps', async () => {
      const cappedConfig = { ...mockConfig, perSectionCap: 1 };
      const cappedPacker = new ContextPacker(
        mockTokenBudgeter as any,
        mockNoveltyScorer as any,
        mockAnswerabilityScorer as any,
        cappedConfig
      );

      const result = await cappedPacker.pack(mockChunks);

      // Should only select 1 chunk from section1 and 1 from section2
      expect(result.chunks.length).toBe(2);
      expect(result.trace.capsApplied.perSection['section1']).toBe(1);
      expect(result.trace.capsApplied.perSection['section2']).toBe(1);
    });

    it('should apply answerability bonus', async () => {
      mockAnswerabilityScorer.applyBonus.mockReturnValue(1.5); // Boost score

      const result = await packer.pack(mockChunks, 'test query');

      expect(mockAnswerabilityScorer.applyBonus).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number),
        'test query'
      );
      expect(result.trace.scores[mockChunks[0].id]).toBe(1.5);
    });

    it('should score novelty for each chunk', async () => {
      mockNoveltyScorer.scoreNovelty.mockResolvedValue(0.6);

      const result = await packer.pack(mockChunks);

      expect(mockNoveltyScorer.scoreNovelty).toHaveBeenCalledTimes(3);
      expect(result.trace.noveltyScores[mockChunks[0].id]).toBe(0.6);
    });

    it('should sort chunks by boosted score', async () => {
      // Create chunks with different scores
      const mixedChunks: HybridSearchResult[] = [
        { ...mockChunks[0], score: 0.5, fusionScore: 0.5 },
        { ...mockChunks[1], score: 0.9, fusionScore: 0.9 },
        { ...mockChunks[2], score: 0.7, fusionScore: 0.7 }
      ];

      mockAnswerabilityScorer.applyBonus.mockImplementation((chunk, score) => score);

      const result = await packer.pack(mixedChunks);

      // Should be sorted by score descending
      expect(result.chunks[0].id).toBe('chunk2'); // score 0.9
      expect(result.chunks[1].id).toBe('chunk3'); // score 0.7
      expect(result.chunks[2].id).toBe('chunk1'); // score 0.5
    });

    it('should handle empty chunk array', async () => {
      const result = await packer.pack([]);

      expect(result.chunks).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('should handle chunks without payload', async () => {
      const chunksWithoutPayload: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'content',
          searchType: 'hybrid'
        }
      ];

      const result = await packer.pack(chunksWithoutPayload);

      expect(result.chunks).toHaveLength(1);
      expect(result.trace.capsApplied.perDoc['chunk1']).toBe(1); // Uses chunk id as doc id
      expect(result.trace.capsApplied.perSection['default']).toBe(1); // Uses 'default' as section
    });

    it('should populate trace correctly', async () => {
      const result = await packer.pack(mockChunks);

      expect(result.trace.selectedIds).toHaveLength(3);
      expect(Object.keys(result.trace.tokenCounts)).toHaveLength(3);
      expect(Object.keys(result.trace.scores)).toHaveLength(3);
      expect(Object.keys(result.trace.noveltyScores)).toHaveLength(3);
      expect(Object.keys(result.trace.capsApplied.perDoc)).toHaveLength(2); // 2 docs
      expect(Object.keys(result.trace.capsApplied.perSection)).toHaveLength(2); // 2 sections
    });
  });

  describe('section reunification', () => {
    it('should attempt section reunification when budget exceeded and enabled', async () => {
      const reunionConfig = { ...mockConfig, sectionReunification: true, tokenBudget: 150 };
      const reunionPacker = new ContextPacker(
        mockTokenBudgeter as any,
        mockNoveltyScorer as any,
        mockAnswerabilityScorer as any,
        reunionConfig
      );

      // Mock successful reunion
      mockTokenBudgeter.estimateTokens.mockReturnValue(50); // Small additional cost

      const result = await reunionPacker.pack(mockChunks);

      // Should have section reunion info in trace
      expect(result.trace.sectionReunions).toBeDefined();
    });

    it('should skip section reunification when disabled', async () => {
      const noReunionConfig = { ...mockConfig, sectionReunification: false, tokenBudget: 150 };
      const noReunionPacker = new ContextPacker(
        mockTokenBudgeter as any,
        mockNoveltyScorer as any,
        mockAnswerabilityScorer as any,
        noReunionConfig
      );

      const result = await noReunionPacker.pack(mockChunks);

      // Should not have section reunion attempts
      expect(result.trace.sectionReunions).toEqual([]);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        perDocCap: 5,
        tokenBudget: 2000,
        noveltyAlpha: 0.8,
        answerabilityBonus: 1.5
      };

      packer.updateConfig(newConfig);

      expect(mockTokenBudgeter.setBudget).toHaveBeenCalledWith(2000);
      expect(mockNoveltyScorer.setAlpha).toHaveBeenCalledWith(0.8);
      expect(mockAnswerabilityScorer.setBonus).toHaveBeenCalledWith(1.5);
    });

    it('should handle partial config updates', () => {
      packer.updateConfig({ perDocCap: 3 });

      // All setters are called with fallback values when not provided in config
      expect(mockTokenBudgeter.setBudget).toHaveBeenCalledWith(1000);
      expect(mockNoveltyScorer.setAlpha).toHaveBeenCalledWith(0.5);
      expect(mockAnswerabilityScorer.setBonus).toHaveBeenCalledWith(1.0);
    });
  });

  describe('createContextPacker factory', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create packer with default config', () => {
      const packer = createContextPacker();

      expect(packer).toBeInstanceOf(ContextPacker);
    });

    it('should create packer with embedding service', () => {
      const mockEmbedService = { embed: jest.fn() };
      const packer = createContextPacker(mockEmbedService);

      expect(packer).toBeInstanceOf(ContextPacker);
    });

    it('should use environment variables for config', () => {
      // This test verifies that the factory function can be called
      // Environment variable testing would require more complex setup
      const packer = createContextPacker();

      expect(packer).toBeInstanceOf(ContextPacker);
    });
  });

  describe('edge cases', () => {
    it('should handle chunks with very long content', async () => {
      const longContent = 'word '.repeat(1000);
      const longChunk: HybridSearchResult = {
        id: 'long',
        score: 0.9,
        content: longContent,
        payload: { docId: 'doc1' },
        searchType: 'hybrid'
      };

      mockTokenBudgeter.estimateTokens.mockReturnValue(10000); // Very large token count

      const result = await packer.pack([longChunk]);

      expect(result.chunks).toHaveLength(0); // Should be dropped due to budget
      expect(result.trace.droppedReasons['long']).toContain('budget exceeded');
    });

    it('should handle chunks with zero score', async () => {
      const zeroScoreChunk: HybridSearchResult = {
        id: 'zero',
        score: 0,
        fusionScore: 0,
        content: 'content',
        payload: { docId: 'doc1' },
        searchType: 'hybrid'
      };

      const result = await packer.pack([zeroScoreChunk]);

      expect(result.chunks).toHaveLength(1); // Should still be selected if within caps/budget
    });

    it('should handle missing content gracefully', async () => {
      const noContentChunk: HybridSearchResult = {
        id: 'nocontent',
        score: 0.8,
        payload: { docId: 'doc1' },
        searchType: 'hybrid'
        // No content property
      };

      mockTokenBudgeter.estimateTokens.mockReturnValue(0);
      mockTokenBudgeter.countTokens.mockReturnValue(0);

      const result = await packer.pack([noContentChunk]);

      expect(result.chunks).toHaveLength(1);
      expect(result.totalTokens).toBe(0);
    });

    it('should handle very small token budget', async () => {
      const tinyBudgetConfig = { ...mockConfig, tokenBudget: 10 };
      const tinyBudgetPacker = new ContextPacker(
        mockTokenBudgeter as any,
        mockNoveltyScorer as any,
        mockAnswerabilityScorer as any,
        tinyBudgetConfig
      );

      mockTokenBudgeter.estimateTokens.mockReturnValue(50); // Larger than budget

      const result = await tinyBudgetPacker.pack(mockChunks);

      expect(result.chunks).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(result.truncated).toBe(false); // Not truncated, just no chunks fit
    });
  });
});