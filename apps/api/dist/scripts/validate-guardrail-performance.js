import { guardrailService } from '../services/guardrail.js';
class GuardrailPerformanceValidator {
    async validatePerformance() {
        console.log('🚀 Starting Guardrail Performance Validation...\n');
        const mockUserContext = {
            id: 'perf-test-user',
            groupIds: ['perf-group'],
            tenantId: 'test-tenant'
        };
        const durations = [];
        let successCount = 0;
        let idkCount = 0;
        const totalEvaluations = 100;
        // Test with various result set sizes and score distributions
        const testCases = [
            // High confidence case
            {
                name: 'High confidence',
                results: Array.from({ length: 5 }, (_, i) => ({
                    id: `doc${i}`,
                    score: 0.8 + (Math.random() * 0.15),
                    payload: { content: `High quality content ${i}` }
                }))
            },
            // Low confidence case
            {
                name: 'Low confidence',
                results: Array.from({ length: 3 }, (_, i) => ({
                    id: `doc${i}`,
                    score: 0.1 + (Math.random() * 0.2),
                    payload: { content: `Low quality content ${i}` }
                }))
            },
            // Mixed quality case
            {
                name: 'Mixed quality',
                results: [
                    { id: 'doc1', score: 0.9, payload: { content: 'Excellent match' } },
                    { id: 'doc2', score: 0.3, payload: { content: 'Poor match' } },
                    { id: 'doc3', score: 0.6, payload: { content: 'Moderate match' } },
                    { id: 'doc4', score: 0.1, payload: { content: 'Very poor match' } }
                ]
            },
            // Large result set
            {
                name: 'Large result set',
                results: Array.from({ length: 50 }, (_, i) => ({
                    id: `doc${i}`,
                    score: Math.random(),
                    payload: { content: `Content ${i}` }
                }))
            },
            // No results case
            {
                name: 'No results',
                results: []
            }
        ];
        for (let i = 0; i < totalEvaluations; i++) {
            const testCase = testCases[i % testCases.length];
            const query = `Test query ${i} for ${testCase.name}`;
            try {
                const startTime = performance.now();
                const evaluation = guardrailService.evaluateAnswerability(query, testCase.results, mockUserContext);
                const duration = performance.now() - startTime;
                durations.push(duration);
                successCount++;
                if (!evaluation.isAnswerable) {
                    idkCount++;
                }
                // Log slow evaluations
                if (duration > 50) {
                    console.warn(`⚠️  Slow evaluation (${duration.toFixed(2)}ms) for: ${testCase.name}`);
                }
            }
            catch (error) {
                console.error(`❌ Evaluation failed for ${testCase.name}:`, error);
            }
        }
        const result = {
            avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
            maxDuration: Math.max(...durations),
            minDuration: Math.min(...durations),
            totalEvaluations: successCount,
            successRate: successCount / totalEvaluations,
            idkRate: idkCount / successCount
        };
        return result;
    }
    async validateOODDetection() {
        console.log('🎯 Testing Out-of-Domain Detection...\n');
        const oodQueries = [
            'What is the weather like today?',
            'How do I cook pasta?',
            'What is the capital of France?',
            'Tell me about our competitor\'s financial results',
            'What is the meaning of life?',
            'How many employees work at Google?',
            'What should I have for lunch?'
        ];
        const mockUserContext = {
            id: 'ood-test-user',
            groupIds: ['test-group'],
            tenantId: 'acme_corp'
        };
        let correctIdkDecisions = 0;
        for (const query of oodQueries) {
            // Simulate low-relevance results typical for OOD queries
            const simulatedResults = [
                {
                    id: 'doc1',
                    score: 0.05 + Math.random() * 0.15,
                    payload: { content: 'Unrelated business document content.' }
                },
                {
                    id: 'doc2',
                    score: 0.02 + Math.random() * 0.1,
                    payload: { content: 'Another unrelated document.' }
                }
            ];
            const evaluation = guardrailService.evaluateAnswerability(query, simulatedResults, mockUserContext);
            if (!evaluation.isAnswerable) {
                correctIdkDecisions++;
                console.log(`✅ "${query}" → IDK (${evaluation.idkResponse?.reasonCode})`);
            }
            else {
                console.log(`❌ "${query}" → Answerable (confidence: ${evaluation.score.confidence.toFixed(3)})`);
            }
        }
        const accuracy = correctIdkDecisions / oodQueries.length;
        console.log(`\n📊 OOD Detection Accuracy: ${correctIdkDecisions}/${oodQueries.length} (${(accuracy * 100).toFixed(1)}%)`);
    }
    async validateTenantConfigurations() {
        console.log('🏢 Testing Tenant Configuration System...\n');
        const testQuery = 'What are our company policies?';
        const moderateResults = [
            { id: 'doc1', score: 0.6, payload: { content: 'Policy document content' } },
            { id: 'doc2', score: 0.55, payload: { content: 'Related policy information' } }
        ];
        const tenants = [
            { id: 'enterprise', name: 'Enterprise (Strict)' },
            { id: 'default', name: 'Default (Moderate)' },
            { id: 'dev', name: 'Development (Permissive)' }
        ];
        for (const tenant of tenants) {
            const userContext = {
                id: 'tenant-test-user',
                groupIds: ['test-group'],
                tenantId: tenant.id
            };
            const evaluation = guardrailService.evaluateAnswerability(testQuery, moderateResults, userContext);
            console.log(`${tenant.name}: ${evaluation.isAnswerable ? 'Answerable' : 'IDK'} (confidence: ${evaluation.score.confidence.toFixed(3)})`);
        }
    }
    printResults(result) {
        console.log('\n📈 Performance Test Results:');
        console.log('================================');
        console.log(`Average Duration: ${result.avgDuration.toFixed(2)}ms`);
        console.log(`Maximum Duration: ${result.maxDuration.toFixed(2)}ms`);
        console.log(`Minimum Duration: ${result.minDuration.toFixed(2)}ms`);
        console.log(`Total Evaluations: ${result.totalEvaluations}`);
        console.log(`Success Rate: ${(result.successRate * 100).toFixed(1)}%`);
        console.log(`IDK Rate: ${(result.idkRate * 100).toFixed(1)}%`);
        console.log('================================');
        // Performance validation
        const meetsPerformanceTarget = result.avgDuration < 50;
        const reliablePerformance = result.maxDuration < 100;
        const highSuccessRate = result.successRate > 0.95;
        console.log('\n✅ Performance Validation:');
        console.log(`${meetsPerformanceTarget ? '✅' : '❌'} Average duration < 50ms: ${result.avgDuration.toFixed(2)}ms`);
        console.log(`${reliablePerformance ? '✅' : '❌'} Max duration < 100ms: ${result.maxDuration.toFixed(2)}ms`);
        console.log(`${highSuccessRate ? '✅' : '❌'} Success rate > 95%: ${(result.successRate * 100).toFixed(1)}%`);
        if (meetsPerformanceTarget && reliablePerformance && highSuccessRate) {
            console.log('\n🎉 All performance targets met!');
        }
        else {
            console.log('\n⚠️  Some performance targets not met.');
        }
    }
}
// Main execution
async function main() {
    const validator = new GuardrailPerformanceValidator();
    try {
        // Run performance validation
        const performanceResult = await validator.validatePerformance();
        validator.printResults(performanceResult);
        // Run OOD detection validation
        await validator.validateOODDetection();
        // Run tenant configuration validation
        await validator.validateTenantConfigurations();
        console.log('\n🏁 Guardrail validation completed successfully!');
    }
    catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
}
// Export for use as module or run directly
export { GuardrailPerformanceValidator };
// Run if called directly
if (require.main === module) {
    main();
}
