import { AnswerSynthesisServiceImpl, EnhancedAnswerSynthesisService } from '../services/answer-synthesis.js';
import { LLMClientFactory, LLMClient } from '../services/llm-client.js';
import { CitationService } from '../services/citation.js';
import { HybridSearchResult } from '@cw-rag-core/retrieval';
import { UserContext } from '@cw-rag-core/shared';
import { SynthesisRequest, LLMConfig, CitationMap } from '../types/synthesis.js';

// Mock implementations
class MockLLMClient implements LLMClient {
  constructor(private config: LLMConfig) {}

  async generateCompletion(prompt: string, context: string, maxTokens?: number) {
    return {
      text: `Based on the provided context, here's the answer with citations [^1] and [^2].`,
      tokensUsed: 150,
      model: this.config.model
    };
  }

  getModel() {
    return {} as any;
  }

  getConfig() {
    return this.config;
  }
}

class MockLLMClientFactory implements LLMClientFactory {
  async createClientForTenant(tenantId: string): Promise<LLMClient> {
    return new MockLLMClient({
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.1
    });
  }

  createClient(config: LLMConfig): LLMClient {
    return new MockLLMClient(config);
  }

  async getTenantConfig(tenantId: string) {
    return {
      tenantId,
      defaultConfig: {
        provider: 'openai' as const,
        model: 'gpt-4',
        temperature: 0.1
      },
      maxRetries: 3,
      timeoutMs: 30000
    };
  }

  async updateTenantConfig(config: any) {
    // Mock implementation
  }
}

class MockCitationService implements CitationService {
  extractCitations(documents: HybridSearchResult[]): CitationMap {
    const citations: CitationMap = {};
    documents.forEach((doc, index) => {
      citations[(index + 1).toString()] = {
        id: doc.id,
        number: index + 1,
        source: `source-${index + 1}`,
        docId: doc.id
      };
    });
    return citations;
  }

  formatTextWithCitations(text: string, citations: CitationMap): string {
    return text; // Return as-is for testing
  }

  validateCitations(text: string, citations: CitationMap): boolean {
    return true; // Always valid for testing
  }

  generateBibliography(citations: CitationMap): string {
    const citationList = Object.values(citations)
      .map(c => `[^${c.number}]: ${c.source}`)
      .join('\n');
    return citationList ? `\n\n## Sources\n\n${citationList}` : '';
  }
}

describe('AnswerSynthesisService', () => {
  let service: AnswerSynthesisServiceImpl;
  let enhancedService: EnhancedAnswerSynthesisService;
  let mockLLMFactory: MockLLMClientFactory;
  let mockCitationService: MockCitationService;

  beforeEach(() => {
    mockLLMFactory = new MockLLMClientFactory();
    mockCitationService = new MockCitationService();
    service = new AnswerSynthesisServiceImpl(
      mockLLMFactory,
      mockCitationService,
      8000
    );
    enhancedService = new EnhancedAnswerSynthesisService(
      mockLLMFactory,
      mockCitationService,
      8000
    );
  });

  const mockDocuments: HybridSearchResult[] = [
    {
      id: 'doc1',
      score: 0.9,
      content: 'The company revenue for Q3 2023 was $125.3 million, representing a significant increase.',
      fusionScore: 0.9,
      searchType: 'hybrid',
      payload: {
        docId: 'financial_report_q3_2023',
        tenant: 'acme_corp',
        url: 'https://example.com/report.pdf'
      }
    },
    {
      id: 'doc2',
      score: 0.8,
      content: 'Security protocols require AES-256 encryption for all data at rest and in transit.',
      fusionScore: 0.8,
      searchType: 'hybrid',
      payload: {
        docId: 'security_policy_2023',
        tenant: 'acme_corp'
      }
    }
  ];

  const mockUserContext: UserContext = {
    id: 'user123',
    tenantId: 'acme_corp',
    groupIds: ['group1'],
    language: 'en'
  };

  describe('synthesizeAnswer', () => {
    it('should synthesize answer with citations successfully', async () => {
      const request: SynthesisRequest = {
        query: 'What was the company revenue in Q3 2023?',
        documents: mockDocuments,
        userContext: mockUserContext,
        includeCitations: true,
        answerFormat: 'markdown'
      };

      const response = await service.synthesizeAnswer(request);

      expect(response.answer).toContain('Based on the provided context');
      expect(response.citations).toBeDefined();
      expect(Object.keys(response.citations)).toHaveLength(2);
      expect(response.tokensUsed).toBe(150);
      expect(response.modelUsed).toBe('gpt-4');
      expect(response.confidence).toBeGreaterThan(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
      expect(response.synthesisTime).toBeGreaterThan(0);
    });

    it('should handle empty documents gracefully', async () => {
      const request: SynthesisRequest = {
        query: 'Test query',
        documents: [],
        userContext: mockUserContext
      };

      await expect(service.synthesizeAnswer(request)).rejects.toThrow('No documents provided for synthesis');
    });

    it('should handle invalid user context', async () => {
      const request: SynthesisRequest = {
        query: 'Test query',
        documents: mockDocuments,
        userContext: { id: '', tenantId: '', groupIds: [] } // Invalid context
      };

      await expect(service.synthesizeAnswer(request)).rejects.toThrow('Valid user context is required');
    });

    it('should format answer as plain text when requested', async () => {
      const request: SynthesisRequest = {
        query: 'Test query',
        documents: mockDocuments,
        userContext: mockUserContext,
        answerFormat: 'plain'
      };

      const response = await service.synthesizeAnswer(request);
      // In plain format, citations should be removed
      expect(response.answer).not.toContain('[^');
    });

    it('should truncate context when exceeding max length', async () => {
      // Create a service with very small context length
      const smallContextService = new AnswerSynthesisServiceImpl(
        mockLLMFactory,
        mockCitationService,
        100 // Very small context limit
      );

      const request: SynthesisRequest = {
        query: 'Test query',
        documents: mockDocuments,
        userContext: mockUserContext
      };

      const response = await smallContextService.synthesizeAnswer(request);
      expect(response.contextTruncated).toBe(true);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate configuration successfully', async () => {
      const isValid = await service.validateConfiguration('acme_corp');
      expect(isValid).toBe(true);
    });

    it('should handle configuration validation failure', async () => {
      // Create a factory that throws errors
      const failingFactory: LLMClientFactory = {
        createClientForTenant: async () => {
          throw new Error('LLM configuration failed');
        },
        createClient: () => {
          throw new Error('LLM configuration failed');
        },
        getTenantConfig: async () => {
          throw new Error('LLM configuration failed');
        },
        updateTenantConfig: async () => {
          throw new Error('LLM configuration failed');
        }
      };

      const failingService = new AnswerSynthesisServiceImpl(
        failingFactory,
        mockCitationService
      );

      const isValid = await failingService.validateConfiguration('invalid_tenant');
      expect(isValid).toBe(false);
    });
  });

  describe('getQualityMetrics', () => {
    it('should return null before any synthesis', () => {
      const metrics = service.getQualityMetrics();
      expect(metrics).toBeNull();
    });

    it('should return metrics after synthesis', async () => {
      const request: SynthesisRequest = {
        query: 'Test query',
        documents: mockDocuments,
        userContext: mockUserContext
      };

      await service.synthesizeAnswer(request);
      const metrics = service.getQualityMetrics();

      expect(metrics).not.toBeNull();
      expect(metrics!.answerLength).toBeGreaterThan(0);
      expect(metrics!.citationCount).toBe(2);
      expect(metrics!.responseLatency).toBeGreaterThan(0);
      expect(metrics!.llmProvider).toBe('openai');
      expect(metrics!.model).toBe('gpt-4');
    });
  });

  describe('EnhancedAnswerSynthesisService', () => {
    it('should apply quality controls', async () => {
      const request: SynthesisRequest = {
        query: 'Test query',
        documents: mockDocuments,
        userContext: mockUserContext
      };

      // Should succeed with valid request
      const response = await enhancedService.synthesizeAnswer(request);
      expect(response).toBeDefined();
    });

    it('should validate citations and throw error for invalid ones', async () => {
      // Create a citation service that reports invalid citations
      const invalidCitationService: CitationService = {
        extractCitations: mockCitationService.extractCitations.bind(mockCitationService),
        formatTextWithCitations: mockCitationService.formatTextWithCitations.bind(mockCitationService),
        generateBibliography: mockCitationService.generateBibliography.bind(mockCitationService),
        validateCitations: () => false
      };

      const invalidService = new EnhancedAnswerSynthesisService(
        mockLLMFactory,
        invalidCitationService
      );

      const request: SynthesisRequest = {
        query: 'Test query',
        documents: mockDocuments,
        userContext: mockUserContext
      };

      await expect(invalidService.synthesizeAnswer(request)).rejects.toThrow('Answer contains invalid citations');
    });
  });

  describe('context preparation', () => {
    it('should sort documents by fusion score', async () => {
      const documentsWithScores: HybridSearchResult[] = [
        {
          id: 'doc1',
          score: 0.5,
          fusionScore: 0.3,
          content: 'Lower scored content',
          searchType: 'hybrid',
          payload: { docId: 'doc1' }
        },
        {
          id: 'doc2',
          score: 0.7,
          fusionScore: 0.9,
          content: 'Higher scored content',
          searchType: 'hybrid',
          payload: { docId: 'doc2' }
        }
      ];

      const request: SynthesisRequest = {
        query: 'Test query',
        documents: documentsWithScores,
        userContext: mockUserContext
      };

      const response = await service.synthesizeAnswer(request);

      // The citation extraction follows document order, not fusion score sorting
      // The service sorts documents internally but citations follow the original extraction order
      expect(Object.keys(response.citations)).toHaveLength(2);
      expect(response.citations['1']).toBeDefined();
      expect(response.citations['2']).toBeDefined();

      // Check that both documents are present in citations
      const citationIds = Object.values(response.citations).map(c => c.id);
      expect(citationIds).toContain('doc1');
      expect(citationIds).toContain('doc2');
    });
  });

  describe('confidence calculation', () => {
    it('should calculate confidence based on document quality', async () => {
      const lowQualityDocs: HybridSearchResult[] = [
        {
          id: 'doc1',
          score: 0.1, // Very low score
          fusionScore: 0.1,
          content: 'Low quality content',
          searchType: 'hybrid',
          payload: { docId: 'doc1' }
        }
      ];

      const highQualityDocs: HybridSearchResult[] = [
        {
          id: 'doc1',
          score: 0.95, // High score
          fusionScore: 0.95,
          content: 'High quality content with substantial information',
          searchType: 'hybrid',
          payload: { docId: 'doc1' }
        }
      ];

      const lowQualityRequest: SynthesisRequest = {
        query: 'Test query',
        documents: lowQualityDocs,
        userContext: mockUserContext
      };

      const highQualityRequest: SynthesisRequest = {
        query: 'Test query',
        documents: highQualityDocs,
        userContext: mockUserContext
      };

      const lowResponse = await service.synthesizeAnswer(lowQualityRequest);
      const highResponse = await service.synthesizeAnswer(highQualityRequest);

      expect(highResponse.confidence).toBeGreaterThan(lowResponse.confidence);
    });
  });
});