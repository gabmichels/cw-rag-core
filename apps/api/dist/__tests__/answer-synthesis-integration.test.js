import { createAnswerSynthesisService } from '../services/answer-synthesis.js';
// Mock LangChain models for testing
jest.mock('@langchain/openai', () => ({
    ChatOpenAI: jest.fn().mockImplementation(() => ({
        invoke: jest.fn().mockImplementation(async (prompt) => {
            // Simple context-aware responses based on the context provided
            if (prompt.includes('security') || prompt.includes('AES') || prompt.includes('encryption')) {
                return {
                    content: 'According to the security documentation [^1], all data is encrypted using AES-256 encryption both at rest and in transit, with key rotation every 90 days.'
                };
            }
            else if (prompt.includes('CEO') || prompt.includes('leadership') || prompt.includes('Sarah Johnson')) {
                return {
                    content: 'Based on the leadership documentation [^1], Sarah Johnson has been serving as CEO since January 2022.'
                };
            }
            else if (prompt.includes('revenue') || prompt.includes('financial') || prompt.includes('125.3')) {
                return {
                    content: 'Based on the provided financial reports [^1], the company\'s revenue for Q3 2023 was $125.3 million, representing a 15% increase over the previous quarter.'
                };
            }
            else {
                return {
                    content: 'Based on the provided context [^1], I can provide information about your query.'
                };
            }
        })
    }))
}));
jest.mock('@langchain/anthropic', () => ({
    ChatAnthropic: jest.fn().mockImplementation(() => ({
        invoke: jest.fn().mockImplementation(async (prompt) => {
            // Same context-aware logic as OpenAI mock
            if (prompt.includes('security') || prompt.includes('AES') || prompt.includes('encryption')) {
                return {
                    content: 'According to the security documentation [^1], all data is encrypted using AES-256 encryption both at rest and in transit, with key rotation every 90 days.'
                };
            }
            else if (prompt.includes('CEO') || prompt.includes('leadership') || prompt.includes('Sarah Johnson')) {
                return {
                    content: 'Based on the leadership documentation [^1], Sarah Johnson has been serving as CEO since January 2022.'
                };
            }
            else if (prompt.includes('revenue') || prompt.includes('financial') || prompt.includes('125.3')) {
                return {
                    content: 'Based on the provided financial reports [^1], the company\'s revenue for Q3 2023 was $125.3 million, representing a 15% increase over the previous quarter.'
                };
            }
            else {
                return {
                    content: 'Based on the provided context [^1], I can provide information about your query.'
                };
            }
        })
    }))
}));
describe('Answer Synthesis Integration Tests', () => {
    let synthesisService;
    beforeEach(() => {
        // Set environment variables for testing
        process.env.OPENAI_API_KEY = 'test-key';
        process.env.ANTHROPIC_API_KEY = 'test-key';
        synthesisService = createAnswerSynthesisService(true, 8000);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    const mockUserContext = {
        id: 'user123',
        tenantId: 'acme_corp',
        groupIds: ['finance', 'executives'],
        language: 'en'
    };
    describe('Financial Query Integration', () => {
        it('should synthesize comprehensive financial answer with proper citations', async () => {
            const documents = [
                {
                    id: 'financial_report_q3_2023',
                    score: 0.95,
                    content: 'Q3 2023 Financial Results: Revenue reached $125.3 million, up 15% from Q2 2023. Net income was $23.7 million, an increase of 8% year-over-year. The company exceeded analyst expectations by $2.1 million.',
                    fusionScore: 0.95,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'financial_report_q3_2023',
                        tenant: 'acme_corp',
                        url: 'https://acme.com/reports/q3-2023.pdf',
                        authors: ['CFO Office', 'Finance Team'],
                        version: '1.0',
                        acl: ['finance', 'executives']
                    }
                },
                {
                    id: 'quarterly_comparison_2023',
                    score: 0.87,
                    content: 'Quarter-over-quarter analysis shows consistent growth: Q1 2023: $98.2M, Q2 2023: $109.1M, Q3 2023: $125.3M. The 15% Q2-Q3 growth represents the highest quarterly increase this year.',
                    fusionScore: 0.87,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'quarterly_comparison_2023',
                        tenant: 'acme_corp',
                        filepath: '/reports/quarterly-analysis.xlsx',
                        acl: ['finance']
                    }
                }
            ];
            const request = {
                query: 'What was the company\'s revenue for Q3 2023?',
                documents,
                userContext: mockUserContext,
                maxContextLength: 8000,
                includeCitations: true,
                answerFormat: 'markdown'
            };
            const response = await synthesisService.synthesizeAnswer(request);
            // Verify answer structure
            expect(response.answer).toContain('$125.3 million');
            expect(response.answer).toContain('[^1]');
            expect(response.answer).toContain('## Sources');
            // Verify citations
            expect(Object.keys(response.citations)).toHaveLength(2);
            expect(response.citations['1'].source).toBe('acme.com/reports/q3-2023.pdf');
            expect(response.citations['2'].source).toBe('quarterly-analysis.xlsx');
            // Verify metadata
            expect(response.tokensUsed).toBeGreaterThan(0);
            expect(response.confidence).toBeGreaterThan(0.7);
            expect(response.synthesisTime).toBeGreaterThan(0);
            expect(response.modelUsed).toBe('gpt-4.1-2025-04-14');
            expect(response.contextTruncated).toBe(false);
        });
    });
    describe('Security Policy Integration', () => {
        it('should synthesize security answer with technical details and citations', async () => {
            const documents = [
                {
                    id: 'security_policy_2023',
                    score: 0.93,
                    content: 'Security Policy Section 4.2: Data Encryption - All sensitive data must be encrypted using AES-256 encryption standards. This applies to data at rest in databases and data in transit over networks. Encryption keys must be rotated every 90 days using automated key management systems.',
                    fusionScore: 0.93,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'security_policy_2023',
                        tenant: 'acme_corp',
                        url: 'https://acme.com/policies/security.html',
                        version: '2.1',
                        acl: ['security', 'engineering']
                    }
                }
            ];
            const request = {
                query: 'What are the security protocols for data encryption?',
                documents,
                userContext: mockUserContext,
                includeCitations: true,
                answerFormat: 'markdown'
            };
            const response = await synthesisService.synthesizeAnswer(request);
            // Verify technical content
            expect(response.answer).toContain('AES-256');
            expect(response.answer).toContain('90 days');
            expect(response.answer).toContain('[^1]');
            // Verify citation details
            expect(response.citations['1'].version).toBe('2.1');
            expect(response.citations['1'].url).toBe('https://acme.com/policies/security.html');
            // Verify quality metrics
            const metrics = synthesisService.getQualityMetrics();
            expect(metrics.citationCount).toBe(1);
            expect(metrics.contextUtilization).toBeGreaterThan(0);
        });
    });
    describe('Multi-Document Synthesis', () => {
        it('should handle multiple related documents and synthesize coherent answer', async () => {
            const documents = [
                {
                    id: 'ceo_bio',
                    score: 0.91,
                    content: 'Executive Leadership Team: Sarah Johnson, Chief Executive Officer (since January 2022), leads the company\'s strategic vision and operational excellence initiatives.',
                    fusionScore: 0.91,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'company_leadership_2023',
                        tenant: 'acme_corp'
                    }
                },
                {
                    id: 'org_chart',
                    score: 0.88,
                    content: 'Organizational Structure: CEO Sarah Johnson reports to the Board of Directors and oversees the executive team including CTO Mark Williams and CFO Lisa Chen.',
                    fusionScore: 0.88,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'org_chart_2023',
                        tenant: 'acme_corp'
                    }
                },
                {
                    id: 'leadership_history',
                    score: 0.84,
                    content: 'Leadership Transitions: Following the retirement of former CEO Robert Smith in December 2021, Sarah Johnson was appointed as CEO effective January 1, 2022.',
                    fusionScore: 0.84,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'leadership_history',
                        tenant: 'acme_corp'
                    }
                }
            ];
            const request = {
                query: 'Who is the current CEO?',
                documents,
                userContext: mockUserContext,
                includeCitations: true,
                answerFormat: 'markdown'
            };
            const response = await synthesisService.synthesizeAnswer(request);
            // Should have multiple citations
            expect(Object.keys(response.citations)).toHaveLength(3);
            // Should maintain reasonable confidence with multiple supporting sources
            expect(response.confidence).toBeGreaterThanOrEqual(0.8);
            // Context should not be truncated with reasonable content length
            expect(response.contextTruncated).toBe(false);
        });
    });
    describe('Edge Cases', () => {
        it('should handle very long documents with context truncation', async () => {
            const longContent = 'Very long document content. '.repeat(1000); // ~27,000 characters
            const documents = [
                {
                    id: 'long_doc',
                    score: 0.9,
                    content: longContent,
                    fusionScore: 0.9,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'long_document',
                        tenant: 'acme_corp'
                    }
                }
            ];
            // Create service with small context window
            const smallContextService = createAnswerSynthesisService(true, 1000);
            const request = {
                query: 'Summarize the document',
                documents,
                userContext: mockUserContext
            };
            const response = await smallContextService.synthesizeAnswer(request);
            expect(response.contextTruncated).toBe(true);
            expect(response.confidence).toBeLessThan(0.9); // Reduced confidence due to truncation
        });
        it('should handle documents with missing metadata gracefully', async () => {
            const documents = [
                {
                    id: 'minimal_doc',
                    score: 0.8,
                    content: 'Document with minimal metadata that is long enough to not be filtered out by the enhanced citation service which has minimum length requirements.',
                    fusionScore: 0.8,
                    searchType: 'hybrid',
                    payload: {} // Empty payload
                }
            ];
            const request = {
                query: 'Test query about minimal document',
                documents,
                userContext: mockUserContext,
                includeCitations: true
            };
            const response = await synthesisService.synthesizeAnswer(request);
            // Should still generate citation with fallback source
            expect(Object.keys(response.citations)).toHaveLength(1);
            expect(response.citations['1'].source).toBe('minimal_doc'); // Fallback to doc ID
            expect(response.citations['1'].docId).toBe('minimal_doc');
        });
        it('should maintain citation accuracy under various conditions', async () => {
            const documents = [
                {
                    id: 'doc_with_special_chars',
                    score: 0.9,
                    content: 'Document with special characters: ñáéíóú, symbols @#$%^&*().',
                    fusionScore: 0.9,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'special_chars_doc',
                        tenant: 'acme_corp',
                        url: 'https://example.com/docs/special-chars.pdf'
                    }
                }
            ];
            const request = {
                query: 'Handle special characters',
                documents,
                userContext: mockUserContext,
                includeCitations: true
            };
            const response = await synthesisService.synthesizeAnswer(request);
            // Citation validation should pass
            const citationService = synthesisService.citationService;
            const isValid = citationService.validateCitations(response.answer, response.citations);
            expect(isValid).toBe(true);
        });
    });
    describe('Performance Benchmarks', () => {
        it('should meet synthesis latency target (<3s)', async () => {
            const documents = [
                {
                    id: 'perf_test_doc',
                    score: 0.9,
                    content: 'Performance test document with adequate content for synthesis.',
                    fusionScore: 0.9,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'perf_test',
                        tenant: 'acme_corp'
                    }
                }
            ];
            const request = {
                query: 'Performance test query',
                documents,
                userContext: mockUserContext
            };
            const startTime = performance.now();
            const response = await synthesisService.synthesizeAnswer(request);
            const endTime = performance.now();
            const totalLatency = endTime - startTime;
            // Should meet <3s target (allowing some overhead for mocked responses)
            expect(totalLatency).toBeLessThan(3000);
            expect(response.synthesisTime).toBeLessThan(3000);
            // Quality metrics should indicate good performance
            const metrics = synthesisService.getQualityMetrics();
            expect(metrics.responseLatency).toBeLessThan(3000);
        });
        it('should handle multiple concurrent synthesis requests', async () => {
            const documents = [
                {
                    id: 'concurrent_test_doc',
                    score: 0.9,
                    content: 'Document for concurrent processing test.',
                    fusionScore: 0.9,
                    searchType: 'hybrid',
                    payload: {
                        docId: 'concurrent_test',
                        tenant: 'acme_corp'
                    }
                }
            ];
            const requests = Array.from({ length: 5 }, (_, i) => ({
                query: `Concurrent query ${i + 1}`,
                documents,
                userContext: mockUserContext
            }));
            const startTime = performance.now();
            const responses = await Promise.all(requests.map(request => synthesisService.synthesizeAnswer(request)));
            const endTime = performance.now();
            expect(responses).toHaveLength(5);
            responses.forEach(response => {
                expect(response.answer).toBeDefined();
                expect(response.confidence).toBeGreaterThan(0);
            });
            // Total time for 5 concurrent requests should be reasonable
            expect(endTime - startTime).toBeLessThan(5000);
        });
    });
});
