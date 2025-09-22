import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { guardrailService } from '../services/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OODTestCase {
  id: string;
  query: string;
  tenantId: string;
  expectedResponse: string;
  category: string;
}

describe('Out-of-Domain Validation with ood.jsonl', () => {
  let oodTestCases: OODTestCase[];
  let mockUserContext: UserContext;

  beforeAll(async () => {

    // Load ood.jsonl test cases
    const oodFilePath = path.join(__dirname, '../../../../packages/evals/data/ood.jsonl');
    try {
      const oodContent = fs.readFileSync(oodFilePath, 'utf-8');

      oodTestCases = oodContent
        .trim()
        .split('\n')
        .filter(line => line.trim().length > 0) // Filter out empty lines
        .map(line => {
          try {
            return JSON.parse(line) as OODTestCase;
          } catch (e) {
            console.warn('Failed to parse test case:', line);
            return null;
          }
        })
        .filter((testCase): testCase is OODTestCase => testCase !== null && !!testCase.id && !!testCase.query);
    } catch (e) {
      console.warn('Failed to load ood.jsonl test cases:', e);
      oodTestCases = []; // Use empty array if file cannot be loaded
    }

    mockUserContext = {
      id: 'ood-test-user',
      groupIds: ['ood-group'],
      tenantId: 'acme_corp'
    };
  });

  describe('OOD detection accuracy', () => {
    it('should correctly identify all OOD queries as non-answerable', () => {
      if (oodTestCases.length === 0) {
        console.warn('No OOD test cases available, skipping test');
        return;
      }

      let correctIdkDecisions = 0;
      const results: Array<{
        testCase: OODTestCase;
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string;
      }> = [];

      for (const testCase of oodTestCases) {
        // Simulate low-relevance search results for OOD queries
        const simulatedResults = [
          {
            id: 'doc1',
            score: 0.1 + Math.random() * 0.2, // Low relevance scores
            payload: {
              content: 'Some business document content that is not related to the query.',
              tenant: testCase.tenantId,
              docId: 'doc1',
              acl: ['user1']
            }
          },
          {
            id: 'doc2',
            score: 0.05 + Math.random() * 0.15,
            payload: {
              content: 'Another unrelated business document.',
              tenant: testCase.tenantId,
              docId: 'doc2',
              acl: ['user1']
            }
          }
        ];

        const userContext = { ...mockUserContext, tenantId: testCase.tenantId };
        const evaluation = guardrailService.evaluateAnswerability(
          testCase.query,
          simulatedResults,
          userContext
        );

        const result = {
          testCase,
          isAnswerable: evaluation.isAnswerable,
          confidence: evaluation.score.confidence,
          reasonCode: evaluation.idkResponse?.reasonCode
        };

        results.push(result);

        if (!evaluation.isAnswerable && testCase.expectedResponse === 'IDK') {
          correctIdkDecisions++;
        }
      }

      // Calculate accuracy
      const accuracy = correctIdkDecisions / oodTestCases.length;

      console.log(`OOD Detection Results:`);
      console.log(`Total test cases: ${oodTestCases.length}`);
      console.log(`Correct IDK decisions: ${correctIdkDecisions}`);
      console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}%`);

      // Log details for failed cases
      const failedCases = results.filter(r =>
        r.isAnswerable && r.testCase.expectedResponse === 'IDK'
      );

      if (failedCases.length > 0) {
        console.log(`Failed cases (false positives):`);
        failedCases.forEach(fc => {
          console.log(`- ${fc.testCase.id}: "${fc.testCase.query}" (confidence: ${fc.confidence.toFixed(3)})`);
        });
      }

      // Expect high accuracy (>= 80% for OOD detection)
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });

    it('should categorize OOD queries correctly by type', () => {
      if (oodTestCases.length === 0) {
        console.warn('No OOD test cases available, skipping test');
        return;
      }

      const categoryResults = new Map<string, { total: number; correct: number }>();

      for (const testCase of oodTestCases) {
        if (!categoryResults.has(testCase.category)) {
          categoryResults.set(testCase.category, { total: 0, correct: 0 });
        }

        const categoryStats = categoryResults.get(testCase.category)!;
        categoryStats.total++;

        // Simulate appropriate results for category
        let simulatedResults: any[];

        if (testCase.category === 'no_relevant_docs') {
          simulatedResults = []; // No results for this category
        } else {
          simulatedResults = [
            {
              id: 'doc1',
              score: 0.05 + Math.random() * 0.1,
              payload: { content: 'Unrelated content' }
            }
          ];
        }

        const userContext = { ...mockUserContext, tenantId: testCase.tenantId };
        const evaluation = guardrailService.evaluateAnswerability(
          testCase.query,
          simulatedResults,
          userContext
        );

        if (!evaluation.isAnswerable) {
          categoryStats.correct++;
        }
      }

      // Report results by category
      console.log('\nResults by category:');
      for (const [category, stats] of categoryResults.entries()) {
        const accuracy = stats.correct / stats.total;
        console.log(`${category}: ${stats.correct}/${stats.total} (${(accuracy * 100).toFixed(1)}%)`);

        // Each category should have good detection rate
        expect(accuracy).toBeGreaterThanOrEqual(0.7);
      }
    });
  });

  describe('confidence calibration', () => {
    it('should have consistently low confidence for OOD queries', () => {
      if (oodTestCases.length === 0) {
        console.warn('No OOD test cases available, skipping test');
        return;
      }

      const confidenceScores: number[] = [];

      for (const testCase of oodTestCases) {
        const simulatedResults = [
          {
            id: 'doc1',
            score: 0.1 + Math.random() * 0.15,
            payload: { content: 'Business document content.' }
          }
        ];

        const userContext = { ...mockUserContext, tenantId: testCase.tenantId };
        const evaluation = guardrailService.evaluateAnswerability(
          testCase.query,
          simulatedResults,
          userContext
        );

        confidenceScores.push(evaluation.score.confidence);
      }

      // Calculate confidence statistics
      const meanConfidence = confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length;
      const maxConfidence = Math.max(...confidenceScores);
      const lowConfidenceCount = confidenceScores.filter(conf => conf < 0.5).length;
      const lowConfidenceRate = lowConfidenceCount / confidenceScores.length;

      console.log(`Confidence statistics for OOD queries:`);
      console.log(`Mean confidence: ${meanConfidence.toFixed(3)}`);
      console.log(`Max confidence: ${maxConfidence.toFixed(3)}`);
      console.log(`Low confidence rate: ${(lowConfidenceRate * 100).toFixed(1)}%`);

      // OOD queries should generally have low confidence
      expect(meanConfidence).toBeLessThan(0.5);
      expect(lowConfidenceRate).toBeGreaterThan(0.8);
    });
  });

  describe('response quality', () => {
    it('should provide helpful IDK responses for each OOD category', () => {
      if (oodTestCases.length === 0) {
        console.warn('No OOD test cases available, skipping test');
        return;
      }

      const categoryResponseTypes = new Map<string, Set<string>>();

      for (const testCase of oodTestCases) {
        const simulatedResults = [
          { id: 'doc1', score: 0.1, payload: { content: 'Unrelated content' } }
        ];

        const userContext = { ...mockUserContext, tenantId: testCase.tenantId };
        const evaluation = guardrailService.evaluateAnswerability(
          testCase.query,
          simulatedResults,
          userContext
        );

        if (!evaluation.isAnswerable && evaluation.idkResponse) {
          if (!categoryResponseTypes.has(testCase.category)) {
            categoryResponseTypes.set(testCase.category, new Set());
          }

          categoryResponseTypes.get(testCase.category)!.add(evaluation.idkResponse.reasonCode);
        }
      }

      // Each category should get appropriate reason codes
      console.log('\nReason codes by category:');
      for (const [category, reasonCodes] of categoryResponseTypes.entries()) {
        console.log(`${category}: ${Array.from(reasonCodes).join(', ')}`);
        expect(reasonCodes.size).toBeGreaterThan(0);
      }
    });

    it('should provide actionable suggestions for OOD queries', () => {
      if (oodTestCases.length === 0) {
        console.warn('No OOD test cases available, skipping test');
        return;
      }

      let totalSuggestions = 0;
      let casesWithSuggestions = 0;

      for (const testCase of oodTestCases) {
        const simulatedResults = [
          { id: 'doc1', score: 0.08, payload: { content: 'Unrelated content' } }
        ];

        const userContext = { ...mockUserContext, tenantId: testCase.tenantId };
        const evaluation = guardrailService.evaluateAnswerability(
          testCase.query,
          simulatedResults,
          userContext
        );

        if (evaluation.idkResponse?.suggestions) {
          casesWithSuggestions++;
          totalSuggestions += evaluation.idkResponse.suggestions.length;
        }
      }

      const avgSuggestionsPerCase = totalSuggestions / casesWithSuggestions;
      const suggestionRate = casesWithSuggestions / oodTestCases.length;

      console.log(`Suggestion statistics:`);
      console.log(`Cases with suggestions: ${casesWithSuggestions}/${oodTestCases.length} (${(suggestionRate * 100).toFixed(1)}%)`);
      console.log(`Average suggestions per case: ${avgSuggestionsPerCase.toFixed(1)}`);

      // Most IDK responses should include helpful suggestions
      expect(suggestionRate).toBeGreaterThan(0.8);
      expect(avgSuggestionsPerCase).toBeGreaterThan(1);
    });
  });
});

describe('Guardrail Threshold Sensitivity Analysis', () => {
  const service = guardrailService;

  it('should show different behavior across threshold configurations', () => {
    const testQuery = 'What is the weather like today?';
    const testResults = [
      { id: 'doc1', score: 0.4, payload: { content: 'Some content' } },
      { id: 'doc2', score: 0.35, payload: { content: 'More content' } }
    ];

    const configurations = [
      { name: 'strict', config: { enabled: true, minConfidence: 0.8, minTopScore: 0.7, minMeanScore: 0.5, minResultCount: 3 } },
      { name: 'moderate', config: { enabled: true, minConfidence: 0.6, minTopScore: 0.5, minMeanScore: 0.3, minResultCount: 2 } },
      { name: 'permissive', config: { enabled: true, minConfidence: 0.4, minTopScore: 0.3, minMeanScore: 0.2, minResultCount: 1 } }
    ];

    const results = configurations.map(({ name, config }) => {
      const tenantId = `threshold-test-${name}`;
      service.updateTenantConfig(tenantId, config);

      const userContext: UserContext = {
        id: 'threshold-user',
        groupIds: ['group1'],
        tenantId
      };

      const evaluation = service.evaluateAnswerability(testQuery, testResults, userContext);

      return {
        name,
        isAnswerable: evaluation.isAnswerable,
        confidence: evaluation.score.confidence
      };
    });

    console.log('\nThreshold sensitivity results:');
    results.forEach(r => {
      console.log(`${r.name}: answerable=${r.isAnswerable}, confidence=${r.confidence.toFixed(3)}`);
    });

    // Strict should be most restrictive, permissive should be most lenient
    const strict = results.find(r => r.name === 'strict')!;
    const permissive = results.find(r => r.name === 'permissive')!;

    expect(strict.isAnswerable).toBe(false);
    expect(permissive.isAnswerable).toBe(true);
  });
});