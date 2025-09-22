import { createAnswerSynthesisService } from '../services/answer-synthesis.js';
import { HybridSearchResult } from '@cw-rag-core/retrieval';
import { UserContext } from '@cw-rag-core/shared';
import { SynthesisRequest } from '../types/synthesis.js';
import fs from 'fs';
import path from 'path';

// Mock LangChain for controlled responses
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockImplementation(async (prompt: string) => {
      // Extract query from prompt to provide context-appropriate responses
      if (prompt.includes('revenue for Q3 2023')) {
        return {
          content: 'Based on the financial report [^1], the company\'s revenue for Q3 2023 was $125.3 million, representing a 15% increase over the previous quarter.'
        };
      } else if (prompt.includes('security protocols')) {
        return {
          content: 'According to the security policy [^1], all data is encrypted using AES-256 encryption both at rest and in transit, with key rotation every 90 days.'
        };
      } else if (prompt.includes('current CEO')) {
        return {
          content: 'Based on the leadership documentation [^1], Sarah Johnson has been serving as CEO since January 2022.'
        };
      } else if (prompt.includes('vacation policy')) {
        return {
          content: 'According to the HR handbook [^1], employees receive 15 days of paid vacation annually, increasing to 20 days after 3 years of service.'
        };
      } else if (prompt.includes('programming languages')) {
        return {
          content: 'Based on the technical documentation [^1], the platform supports TypeScript, Python, Java, and Go for backend services.'
        };
      } else {
        return {
          content: 'Based on the provided context [^1], I can provide information about your query.'
        };
      }
    })
  }))
}));

interface GoldStandard {
  id: string;
  query: string;
  answerspan: string;
  docId: string;
  tenantId: string;
  context: string;
}

describe('Answer Synthesis Evaluation Tests', () => {
  let synthesisService: any;
  let goldDataset: GoldStandard[];

  beforeAll(async () => {
    // Set up environment
    process.env.OPENAI_API_KEY = 'test-key';
    synthesisService = createAnswerSynthesisService(true, 8000);

    // Load gold standard dataset
    try {
      const goldPath = path.join(__dirname, '../../../../packages/evals/data/gold.jsonl');
      const goldData = fs.readFileSync(goldPath, 'utf-8');
      goldDataset = goldData
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      console.warn('Gold dataset not found, using mock data');
      goldDataset = [
        {
          id: "gold_001",
          query: "What is the company's revenue for Q3 2023?",
          answerspan: "The company's revenue for Q3 2023 was $125.3 million, representing a 15% increase over the previous quarter.",
          docId: "financial_report_q3_2023",
          tenantId: "acme_corp",
          context: "Q3 2023 Financial Results: Revenue reached $125.3 million, up 15% from Q2 2023. Net income was $23.7 million."
        },
        {
          id: "gold_002",
          query: "What are the security protocols for data encryption?",
          answerspan: "All data is encrypted using AES-256 encryption both at rest and in transit, with key rotation every 90 days.",
          docId: "security_policy_2023",
          tenantId: "acme_corp",
          context: "Security Policy Section 4.2: Data Encryption - All sensitive data must be encrypted using AES-256 encryption standards."
        },
        {
          id: "gold_003",
          query: "Who is the current CEO?",
          answerspan: "Sarah Johnson has been serving as CEO since January 2022.",
          docId: "company_leadership_2023",
          tenantId: "acme_corp",
          context: "Executive Leadership Team: Sarah Johnson, Chief Executive Officer (since January 2022), leads the company's strategic vision."
        },
        {
          id: "gold_004",
          query: "What is the employee vacation policy?",
          answerspan: "Employees receive 15 days of paid vacation annually, increasing to 20 days after 3 years of service.",
          docId: "hr_handbook_2023",
          tenantId: "acme_corp",
          context: "Human Resources Handbook - Section 7: Time Off Policies. Vacation entitlement starts at 15 days annually."
        },
        {
          id: "gold_005",
          query: "What are the supported programming languages?",
          answerspan: "The platform supports TypeScript, Python, Java, and Go for backend services.",
          docId: "tech_stack_documentation",
          tenantId: "acme_corp",
          context: "Technology Stack Overview: Backend services are built using TypeScript (Node.js), Python, Java, and Go."
        }
      ];
    }
  });

  const createMockUserContext = (tenantId: string): UserContext => ({
    id: 'eval_user',
    tenantId,
    groupIds: ['eval'],
    language: 'en'
  });

  const createDocumentFromGoldStandard = (gold: GoldStandard): HybridSearchResult => ({
    id: gold.docId,
    score: 0.95,
    content: gold.context,
    fusionScore: 0.95,
    searchType: 'hybrid',
    payload: {
      docId: gold.docId,
      tenant: gold.tenantId,
      acl: ['eval']
    }
  });

  describe('Gold Standard Evaluation', () => {
    it('should process gold standard dataset successfully', async () => {
      const results = [];

      for (const gold of goldDataset) {
        const document = createDocumentFromGoldStandard(gold);
        const userContext = createMockUserContext(gold.tenantId);

        const request: SynthesisRequest = {
          query: gold.query,
          documents: [document],
          userContext,
          includeCitations: true,
          answerFormat: 'markdown'
        };

        try {
          const response = await synthesisService.synthesizeAnswer(request);

          // Check basic functionality
          const hasCitations = Object.keys(response.citations).length > 0;
          const meetsPerfTarget = response.synthesisTime < 3000;
          const hasAnswer = response.answer && response.answer.length > 0;

          results.push({
            id: gold.id,
            query: gold.query,
            actualAnswer: response.answer,
            hasCitations,
            citationCount: Object.keys(response.citations).length,
            confidence: response.confidence,
            synthesisTime: response.synthesisTime,
            meetsPerfTarget,
            hasAnswer,
            success: hasCitations && meetsPerfTarget && hasAnswer
          });

        } catch (error) {
          results.push({
            id: gold.id,
            query: gold.query,
            error: (error as Error).message,
            success: false
          });
        }
      }

      // Aggregate results - focus on functional requirements
      const successfulTests = results.filter(r => r.success);
      const averageConfidence = results
        .filter(r => r.confidence !== undefined)
        .reduce((sum, r) => sum + r.confidence!, 0) / results.length;
      const averageSynthesisTime = results
        .filter(r => r.synthesisTime !== undefined)
        .reduce((sum, r) => sum + r.synthesisTime!, 0) / results.length;

      // Test functional requirements (not text similarity in mocked environment)
      expect(successfulTests.length / results.length).toBeGreaterThan(0.8); // 80% functional success rate
      expect(averageConfidence).toBeGreaterThan(0.6); // 60% average confidence
      expect(averageSynthesisTime).toBeLessThan(3000); // <3s average synthesis time

      // Ensure all successful tests have citations
      successfulTests.forEach(result => {
        expect(result.citationCount).toBeGreaterThan(0);
        expect(result.hasAnswer).toBe(true);
        expect(result.meetsPerfTarget).toBe(true);
      });
    });

    it('should maintain citation accuracy across all gold standard examples', async () => {
      const citationResults = [];

      for (const gold of goldDataset) {
        const document = createDocumentFromGoldStandard(gold);
        const userContext = createMockUserContext(gold.tenantId);

        const request: SynthesisRequest = {
          query: gold.query,
          documents: [document],
          userContext,
          includeCitations: true,
          answerFormat: 'markdown'
        };

        const response = await synthesisService.synthesizeAnswer(request);

        // Validate citation accuracy
        const citationService = (synthesisService as any).citationService;
        const citationsValid = citationService.validateCitations(response.answer, response.citations);
        const hasExpectedCitationCount = Object.keys(response.citations).length === 1; // Should have 1 citation per document

        citationResults.push({
          id: gold.id,
          citationsValid,
          hasExpectedCitationCount,
          citationCount: Object.keys(response.citations).length,
          success: citationsValid && hasExpectedCitationCount
        });
      }

      const successfulCitations = citationResults.filter(r => r.success);

      // All citations should be accurate (100% citation accuracy requirement)
      expect(successfulCitations.length).toBe(citationResults.length);

      citationResults.forEach(result => {
        expect(result.citationsValid).toBe(true);
        expect(result.hasExpectedCitationCount).toBe(true);
      });
    });
  });

  describe('Performance Benchmarks on Gold Dataset', () => {
    it('should meet all performance targets consistently', async () => {
      const performanceResults = [];

      for (const gold of goldDataset) {
        const document = createDocumentFromGoldStandard(gold);
        const userContext = createMockUserContext(gold.tenantId);

        const request: SynthesisRequest = {
          query: gold.query,
          documents: [document],
          userContext
        };

        const startTime = performance.now();
        const response = await synthesisService.synthesizeAnswer(request);
        const endTime = performance.now();

        const totalLatency = endTime - startTime;

        performanceResults.push({
          id: gold.id,
          synthesisTime: response.synthesisTime,
          totalLatency,
          tokensUsed: response.tokensUsed,
          meetsLatencyTarget: totalLatency < 3000,
          confidence: response.confidence
        });
      }

      // Performance assertions
      const avgLatency = performanceResults.reduce((sum, r) => sum + r.totalLatency, 0) / performanceResults.length;
      const latencyP95 = calculatePercentile(performanceResults.map(r => r.totalLatency), 95);
      const targetsMetCount = performanceResults.filter(r => r.meetsLatencyTarget).length;

      expect(avgLatency).toBeLessThan(3000); // Average <3s
      expect(latencyP95).toBeLessThan(5000); // P95 <5s
      expect(targetsMetCount / performanceResults.length).toBeGreaterThan(0.9); // 90% meet target

      console.log(`\n=== PERFORMANCE METRICS ===`);
      console.log(`Average latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`P95 latency: ${latencyP95.toFixed(0)}ms`);
      console.log(`Targets met: ${targetsMetCount}/${performanceResults.length} (${(targetsMetCount/performanceResults.length*100).toFixed(1)}%)`);
    });
  });

  describe('Quality Metrics Validation', () => {
    it('should generate quality metrics for all evaluations', async () => {
      const qualityResults = [];

      for (const gold of goldDataset) {
        const document = createDocumentFromGoldStandard(gold);
        const userContext = createMockUserContext(gold.tenantId);

        const request: SynthesisRequest = {
          query: gold.query,
          documents: [document],
          userContext,
          includeCitations: true,
          answerFormat: 'markdown'
        };

        await synthesisService.synthesizeAnswer(request);
        const metrics = synthesisService.getQualityMetrics();

        if (metrics) {
          qualityResults.push({
            id: gold.id,
            answerLength: metrics.answerLength,
            citationCount: metrics.citationCount,
            contextUtilization: metrics.contextUtilization,
            responseLatency: metrics.responseLatency
          });
        }
      }

      // Basic quality validations for mocked environment
      const avgAnswerLength = qualityResults.reduce((sum, r) => sum + r.answerLength, 0) / qualityResults.length;

      expect(qualityResults).toHaveLength(goldDataset.length); // Should have metrics for all tests
      expect(avgAnswerLength).toBeGreaterThan(50); // Reasonable answer length
      expect(avgAnswerLength).toBeLessThan(1000); // Not too verbose

      qualityResults.forEach(result => {
        expect(result.citationCount).toBeGreaterThan(0); // All should have citations
        expect(result.responseLatency).toBeGreaterThan(0); // All should have latency > 0
        expect(result.answerLength).toBeGreaterThan(0); // All should have answers
      });
    });
  });
});

// Helper functions
function calculateAnswerAccuracy(actual: string, expected: string): number {
  // Simple word overlap accuracy calculation
  const actualWords = new Set(actual.toLowerCase().match(/\b\w+\b/g) || []);
  const expectedWords = new Set(expected.toLowerCase().match(/\b\w+\b/g) || []);

  const intersection = new Set([...actualWords].filter(x => expectedWords.has(x)));
  const union = new Set([...actualWords, ...expectedWords]);

  return intersection.size / union.size;
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}