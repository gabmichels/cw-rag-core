# Sample Evaluation Reports

This directory contains sample evaluation reports demonstrating the output formats:

## Files

- **sample-evaluation-report.json**: Complete evaluation results in JSON format
- **sample-evaluation-report.md**: Human-readable markdown report
- **sample-dashboard.html**: Interactive HTML dashboard
- **sample-ci-summary.json**: CI-focused summary for automated checks

## Key Metrics Demonstrated

✅ **Recall@5**: 0.950 (≥ 0.85 threshold)
✅ **IDK Precision**: 0.95 (≥ 0.90 threshold)
✅ **RBAC Leak Rate**: 0.0% (= 0% threshold)
✅ **Injection Bypass**: 0.0% (≤ 2% threshold)

## Usage

These sample reports show what successful evaluation output looks like when all critical thresholds are met. The HTML dashboard can be opened in any browser for interactive viewing.

## Threshold Configuration

The reports demonstrate the Phase 2 thresholds:
- Recall@5 ≥ 0.85 (updated from 0.70)
- IDK precision ≥ 0.90
- RBAC leak rate = 0
- Injection bypass ≤ 2% (updated from 5%)
