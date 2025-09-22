import { guardrailService } from '../services/guardrail.js';
// Simple validation function
function validateGuardrail() {
    console.log('🚀 Testing Guardrail System...\n');
    const mockUserContext = {
        id: 'test-user',
        groupIds: ['test-group'],
        tenantId: 'test-tenant'
    };
    // Test 1: High confidence case
    console.log('Test 1: High Confidence Results');
    const highConfidenceResults = [
        { id: 'doc1', score: 0.85, payload: { content: 'Very relevant content' } },
        { id: 'doc2', score: 0.80, payload: { content: 'Also very relevant' } },
        { id: 'doc3', score: 0.78, payload: { content: 'Another good match' } }
    ];
    const startTime1 = performance.now();
    const eval1 = guardrailService.evaluateAnswerability('high confidence query', highConfidenceResults, mockUserContext);
    const duration1 = performance.now() - startTime1;
    console.log(`Result: ${eval1.isAnswerable ? 'Answerable' : 'IDK'}`);
    console.log(`Confidence: ${eval1.score.confidence.toFixed(3)}`);
    console.log(`Duration: ${duration1.toFixed(2)}ms`);
    console.log(`Score stats: mean=${eval1.score.scoreStats.mean.toFixed(3)}, max=${eval1.score.scoreStats.max.toFixed(3)}\n`);
    // Test 2: Low confidence case
    console.log('Test 2: Low Confidence Results');
    const lowConfidenceResults = [
        { id: 'doc1', score: 0.15, payload: { content: 'Barely relevant' } },
        { id: 'doc2', score: 0.12, payload: { content: 'Also barely relevant' } }
    ];
    const startTime2 = performance.now();
    const eval2 = guardrailService.evaluateAnswerability('low confidence query', lowConfidenceResults, mockUserContext);
    const duration2 = performance.now() - startTime2;
    console.log(`Result: ${eval2.isAnswerable ? 'Answerable' : 'IDK'}`);
    console.log(`Confidence: ${eval2.score.confidence.toFixed(3)}`);
    console.log(`Duration: ${duration2.toFixed(2)}ms`);
    console.log(`IDK Reason: ${eval2.idkResponse?.reasonCode}`);
    console.log(`IDK Message: ${eval2.idkResponse?.message}\n`);
    // Test 3: No results case
    console.log('Test 3: No Results');
    const startTime3 = performance.now();
    const eval3 = guardrailService.evaluateAnswerability('no results query', [], mockUserContext);
    const duration3 = performance.now() - startTime3;
    console.log(`Result: ${eval3.isAnswerable ? 'Answerable' : 'IDK'}`);
    console.log(`Confidence: ${eval3.score.confidence.toFixed(3)}`);
    console.log(`Duration: ${duration3.toFixed(2)}ms`);
    console.log(`IDK Reason: ${eval3.idkResponse?.reasonCode}\n`);
    // Test 4: Performance with large result set
    console.log('Test 4: Performance with Large Result Set');
    const largeResults = Array.from({ length: 100 }, (_, i) => ({
        id: `doc${i}`,
        score: Math.random(),
        payload: { content: `Content ${i}` }
    }));
    const startTime4 = performance.now();
    const eval4 = guardrailService.evaluateAnswerability('large set query', largeResults, mockUserContext);
    const duration4 = performance.now() - startTime4;
    console.log(`Result: ${eval4.isAnswerable ? 'Answerable' : 'IDK'}`);
    console.log(`Confidence: ${eval4.score.confidence.toFixed(3)}`);
    console.log(`Duration: ${duration4.toFixed(2)}ms`);
    console.log(`Results processed: ${eval4.score.scoreStats.count}\n`);
    // Test 5: OOD Queries (simulating ood.jsonl)
    console.log('Test 5: Out-of-Domain Queries');
    const oodQueries = [
        'What is the weather like today?',
        'How do I cook pasta?',
        'What is the capital of France?',
        'What should I have for lunch?'
    ];
    let oodCorrect = 0;
    for (const query of oodQueries) {
        const irrelevantResults = [
            { id: 'doc1', score: 0.08, payload: { content: 'Business document' } }
        ];
        const evaluation = guardrailService.evaluateAnswerability(query, irrelevantResults, mockUserContext);
        if (!evaluation.isAnswerable)
            oodCorrect++;
    }
    console.log(`OOD Detection Rate: ${oodCorrect}/${oodQueries.length} (${((oodCorrect / oodQueries.length) * 100).toFixed(1)}%)\n`);
    // Summary
    console.log('📊 Performance Summary:');
    const avgPerformance = (duration1 + duration2 + duration3 + duration4) / 4;
    console.log(`Average Performance: ${avgPerformance.toFixed(2)}ms`);
    console.log(`Performance Target (<50ms): ${avgPerformance < 50 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`OOD Detection: ${oodCorrect >= 3 ? '✅ PASS' : '❌ FAIL'} (${oodCorrect}/4 correct)`);
    return {
        performance: avgPerformance,
        oodAccuracy: oodCorrect / oodQueries.length
    };
}
// Run validation
validateGuardrail();
