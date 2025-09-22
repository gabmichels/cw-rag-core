import { guardrailService } from '../services/guardrail.js';
async function runValidation() {
    console.log('🚀 Starting Guardrail Validation...\n');
    const mockUserContext = {
        id: 'validation-user',
        groupIds: ['validation-group'],
        tenantId: 'test-tenant'
    };
    // Test 1: Performance validation
    console.log('📊 Performance Test:');
    const durations = [];
    let idkCount = 0;
    for (let i = 0; i < 50; i++) {
        const results = Array.from({ length: 10 }, (_, j) => ({
            id: `doc${j}`,
            score: Math.random(),
            payload: { content: `Test content ${j}` }
        }));
        const startTime = performance.now();
        const evaluation = guardrailService.evaluateAnswerability(`Test query ${i}`, results, mockUserContext);
        const duration = performance.now() - startTime;
        durations.push(duration);
        if (!evaluation.isAnswerable)
            idkCount++;
    }
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`Maximum duration: ${maxDuration.toFixed(2)}ms`);
    console.log(`IDK rate: ${((idkCount / 50) * 100).toFixed(1)}%`);
    console.log(`✅ Performance target (<50ms): ${avgDuration < 50 ? 'PASS' : 'FAIL'}\n`);
    // Test 2: OOD Detection
    console.log('🎯 Out-of-Domain Detection Test:');
    const oodQueries = [
        'What is the weather like today?',
        'How do I cook pasta?',
        'What is the capital of France?',
        'What should I have for lunch?'
    ];
    let oodCorrect = 0;
    for (const query of oodQueries) {
        const lowRelevanceResults = [
            { id: 'doc1', score: 0.1, payload: { content: 'Unrelated business content' } }
        ];
        const evaluation = guardrailService.evaluateAnswerability(query, lowRelevanceResults, mockUserContext);
        if (!evaluation.isAnswerable) {
            oodCorrect++;
            console.log(`✅ "${query}" → IDK (${evaluation.idkResponse?.reasonCode})`);
        }
        else {
            console.log(`❌ "${query}" → Answerable`);
        }
    }
    console.log(`OOD Detection: ${oodCorrect}/${oodQueries.length} (${((oodCorrect / oodQueries.length) * 100).toFixed(1)}%)\n`);
    // Test 3: Tenant Configuration
    console.log('🏢 Tenant Configuration Test:');
    const testQuery = 'What are our policies?';
    const moderateResults = [
        { id: 'doc1', score: 0.6, payload: { content: 'Policy content' } },
        { id: 'doc2', score: 0.55, payload: { content: 'More policy info' } }
    ];
    const tenants = ['enterprise', 'default', 'dev'];
    for (const tenantId of tenants) {
        const userContext = { ...mockUserContext, tenantId };
        const evaluation = guardrailService.evaluateAnswerability(testQuery, moderateResults, userContext);
        console.log(`${tenantId}: ${evaluation.isAnswerable ? 'Answerable' : 'IDK'} (${evaluation.score.confidence.toFixed(3)})`);
    }
    // Test 4: Confidence calibration
    console.log('\n📈 Confidence Calibration Test:');
    const testCases = [
        { name: 'High confidence', results: [{ id: 'doc1', score: 0.9, payload: { content: 'Perfect match' } }] },
        { name: 'Medium confidence', results: [{ id: 'doc1', score: 0.6, payload: { content: 'Good match' } }] },
        { name: 'Low confidence', results: [{ id: 'doc1', score: 0.2, payload: { content: 'Poor match' } }] },
        { name: 'No results', results: [] }
    ];
    for (const testCase of testCases) {
        const evaluation = guardrailService.evaluateAnswerability('test', testCase.results, mockUserContext);
        console.log(`${testCase.name}: confidence=${evaluation.score.confidence.toFixed(3)}, answerable=${evaluation.isAnswerable}`);
    }
    console.log('\n🏁 Validation completed!');
}
runValidation().catch(console.error);
