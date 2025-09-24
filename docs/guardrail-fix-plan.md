# Guardrail Fix Plan - Urgent Issue Resolution

## Critical Issue Analysis

Your RAG system is rejecting queries despite having 78% vector search confidence. The problem is **multi-criteria guardrail logic** where ALL criteria must pass simultaneously.

## Root Cause Identified

### 1. Missing Environment Variable in Docker
**Problem**: `ANSWERABILITY_THRESHOLD` is NOT set in `docker-compose.yml`, defaulting to 0.6 (strict)
**Location**: Your local `.env` has 0.01, but Docker doesn't inherit it

### 2. Multi-Criteria Guardrail Logic
Looking at `packages/retrieval/src/services/answerability-guardrail.ts:408-420`:

```typescript
private applyThresholdDecision(score: AnswerabilityScore, threshold: AnswerabilityThreshold): boolean {
  const checks = [
    score.confidence >= threshold.minConfidence,        // ✓ Likely passing
    score.scoreStats.max >= threshold.minTopScore,     // ❌ Likely failing
    score.scoreStats.mean >= threshold.minMeanScore,   // ❌ Likely failing
    score.scoreStats.stdDev <= threshold.maxStdDev,    // ❌ Likely failing
    score.scoreStats.count >= threshold.minResultCount // ✓ Likely passing
  ];
  return checks.every(check => check);  // ALL must pass
}
```

### 3. Source-Aware Confidence Reduction
Your 78% vector score gets processed through:
1. Source-aware confidence calculation (lines 180-185)
2. Statistical analysis combining vector + keyword + fusion results
3. Final ensemble confidence (much lower than original 78%)

## Immediate Fixes Required

### Fix 1: Add Environment Variable to Docker Compose
Add to `docker-compose.yml` in the `api` service environment section:

```yaml
environment:
  # ... existing vars ...
  - ANSWERABILITY_THRESHOLD=${ANSWERABILITY_THRESHOLD:-0.01}
```

### Fix 2: Add Debug Logging (Critical for Troubleshooting)
In `packages/retrieval/src/services/answerability-guardrail.ts`, modify `applyThresholdDecision`:

```typescript
private applyThresholdDecision(score: AnswerabilityScore, threshold: AnswerabilityThreshold): boolean {
  const checks = [
    { name: 'confidence', pass: score.confidence >= threshold.minConfidence, actual: score.confidence, required: threshold.minConfidence },
    { name: 'maxScore', pass: score.scoreStats.max >= threshold.minTopScore, actual: score.scoreStats.max, required: threshold.minTopScore },
    { name: 'meanScore', pass: score.scoreStats.mean >= threshold.minMeanScore, actual: score.scoreStats.mean, required: threshold.minMeanScore },
    { name: 'stdDev', pass: score.scoreStats.stdDev <= threshold.maxStdDev, actual: score.scoreStats.stdDev, required: threshold.maxStdDev },
    { name: 'resultCount', pass: score.scoreStats.count >= threshold.minResultCount, actual: score.scoreStats.count, required: threshold.minResultCount }
  ];

  const failedChecks = checks.filter(check => !check.pass);

  if (failedChecks.length > 0) {
    console.log('🚫 GUARDRAIL REJECTION DETAILS:');
    console.log('Final confidence:', score.confidence);
    console.log('Vector scores available:', score.sourceAwareConfidence?.stageConfidences?.vector);
    console.log('Failed criteria:');
    failedChecks.forEach(check => {
      console.log(`  ❌ ${check.name}: ${check.actual} (required: ${check.required})`);
    });
    console.log('Passing criteria:');
    checks.filter(check => check.pass).forEach(check => {
      console.log(`  ✅ ${check.name}: ${check.actual}`);
    });
  }

  return checks.every(check => check.pass);
}
```

### Fix 3: Emergency Bypass Configuration
Create tenant-specific override by adding to the same file:

```typescript
async getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig> {
  // Emergency bypass for zenithfall tenant
  if (tenantId === 'zenithfall') {
    return {
      ...this.getDefaultConfig(tenantId),
      threshold: {
        type: 'custom',
        minConfidence: 0.01,
        minTopScore: 0.01,
        minMeanScore: 0.01,
        maxStdDev: 1.0,
        minResultCount: 1
      }
    };
  }

  const config = this.tenantConfigs.get(tenantId);
  if (!config) {
    return this.getDefaultConfig(tenantId);
  }
  return config;
}
```

## Implementation Priority

1. **IMMEDIATE** (< 5 mins): Add environment variable to docker-compose.yml
2. **HIGH** (< 15 mins): Add debug logging to identify exact failure
3. **MEDIUM** (< 30 mins): Implement emergency bypass
4. **LOW** (ongoing): Analyze source-aware confidence calculation

## Test Command
After implementing fixes, test with:
```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Can you show me the Skill Table for Artistry please?",
    "userContext": {
      "id": "test-user",
      "groupIds": ["public"],
      "tenantId": "zenithfall"
    },
    "includeDebugInfo": true
  }'
```

## Expected Outcome
- Debug logs will show exactly which criteria are failing
- Environment variable will apply 0.01 threshold instead of 0.6
- Query should pass guardrail and return proper answer

## Next Steps for Code Mode
1. Switch to Code mode to implement these changes
2. Apply the docker-compose.yml modification
3. Add debug logging to guardrail service
4. Test with the failing query
5. Analyze debug output to confirm fix

The key insight is that your guardrail is designed for **ensemble confidence** (combining multiple search results) but you're expecting it to work like **individual vector confidence**. The 78% vector score becomes much lower after statistical processing.