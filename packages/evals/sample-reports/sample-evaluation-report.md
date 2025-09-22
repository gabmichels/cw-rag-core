# Evaluation Report

**Generated:** 2025-09-22T20:17:14.980Z
**Duration:** 323.46s
**Total Queries:** 67
**Success Rate:** 98.5%

## ✅ Status: PASSED

All metrics meet their thresholds.

## Threshold Validation

### All Validations

| Metric | Expected | Actual | Status |
|--------|----------|--------|---------|
| gold.recallAt5.recall | >= 0.85 | 0.950 | ✅ Pass |
| ood.precision | >= 0.90 | 0.950 | ✅ Pass |
| rbac.leakRate | <= 0.00 | 0.000 | ✅ Pass |
| injection.bypassRate | <= 0.02 | 0.000 | ✅ Pass |

## Performance Metrics

| Metric | Value |
|--------|-------|
| Total API Calls | 67 |
| Average Latency | 194ms |
| Success Rate | 98.5% |
| Retry Rate | 1.5% |
| P95 Latency | 445ms |
| P99 Latency | 892ms |

## Gold Dataset (Information Retrieval)

| Metric | Value |
|--------|-------|
| Recall@1 | 0.850 (17/20) |
| Recall@3 | 0.900 (18/20) |
| Recall@5 | 0.950 (19/20) |
| MRR | 0.875 |
| Queries with Relevant Results | 19/20 |

## Out-of-Domain Dataset (IDK Detection)

| Metric | Value |
|--------|-------|
| Precision | 0.950 |
| Recall | 0.900 |
| F1 Score | 0.925 |
| True Positives | 9 |
| False Positives | 1 |
| False Negatives | 1 |

## Injection Attack Dataset (Security)

| Metric | Value |
|--------|-------|
| Bypass Rate | 0.0% |
| Detection Rate | 100.0% |
| Total Attempts | 15 |
| Successful Bypasses | 0 |
| Detected Attacks | 15 |

## RBAC Dataset (Access Control)

| Metric | Value |
|--------|-------|
| Leak Rate | 0.0% |
| Enforcement Rate | 100.0% |
| Total Queries | 12 |
| Unauthorized Access | 0 |
| Properly Blocked | 12 |

## Configuration

```json
{
  "datasets": [
    "gold",
    "ood",
    "inject",
    "rbac"
  ],
  "retrievalConfig": {
    "topK": 5,
    "hybridSearchWeights": {
      "bm25": 0.7,
      "semantic": 0.3
    },
    "rerankerEnabled": true
  },
  "guardrailsConfig": {
    "injectionDetectionEnabled": true,
    "rbacEnforcementEnabled": true,
    "idkThreshold": 0.5
  },
  "outputConfig": {
    "saveResults": true,
    "outputDir": "./eval-results",
    "includeDetails": true
  },
  "apiConfig": {
    "baseUrl": "http://localhost:3000",
    "timeout": 30000,
    "retries": 3
  }
}
```
