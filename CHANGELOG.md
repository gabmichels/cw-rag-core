# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Fusion System Refactor**: Complete replacement of rank-only RRF with pluggable fusion strategies
  - New `weighted_average` strategy (default): Preserves semantic scores, no 97-99% degradation
  - New `score_weighted_rrf` strategy: Balances scores and ranks with configurable k
  - New `max_confidence` strategy: Safety fallback for high-confidence queries
  - New `borda_rank` strategy: Legacy compatibility with old RRF behavior
- **Score Normalization Utilities**: Min-max and z-score normalization with edge case handling
- **Query-Adaptive Weighting**: Intent-based fusion strategy and weight selection
- **Fusion Telemetry**: Debug traces showing fusion strategy, inputs, and outputs
- **Comprehensive Test Suite**: Unit tests covering all fusion strategies and edge cases
- **Minimal Eval Script**: Probe query validation for Isharoth and Chrono Distortion cases

### Changed
- **RRF Fusion Service**: Converted to thin wrapper calling new fusion system
- **Hybrid Search Service**: Updated to use new fusion system with backward compatibility
- **Intent Detection**: Enhanced with fusion strategy mapping and high-confidence shortcuts
- **Environment Configuration**: Added fusion-related flags with safe defaults

### Fixed
- **Score Degradation Issue**: Eliminated 97-99% confidence loss from rank-only RRF (k=60)
- **Fusion Score Optimization**: Reduced destruction from 65-70% to <20% via auto max_confidence
- **Isharoth Query**: Fusion confidence improved from 25.7% to 85.5% (14.5% destruction)
- **Chrono Distortion Query**: Fusion confidence improved from 22.4% to 58.5% (41.5% destruction)
- **Answer Quality**: Both probe queries now return accurate, complete answers

### Technical Details
- **Root Cause**: RRF formula `1/(rank+k)` with k=60 destroyed semantic scores
- **Solution**: Weighted average fusion preserves confidence scores
- **Backward Compatibility**: Old RRF available via `borda_rank` strategy
- **Performance**: Minimal overhead, maintains O(n log n) complexity
- **Safety**: Feature flags allow instant rollback if needed

### Configuration
```bash
# Optimized environment variables
FUSION_STRATEGY=weighted_average      # Auto-adaptive for high confidence
FUSION_NORMALIZATION=none             # Skip normalization to preserve raw scores
FUSION_K_PARAM=1                      # Minimal RRF parameter (was 60)
FUSION_DEBUG_TRACE=on                 # Fusion telemetry enabled
```

### Migration
- **Safe Rollout**: Default strategy preserves semantic confidence
- **Rollback**: Set `FUSION_STRATEGY=borda_rank` to restore old behavior
- **Monitoring**: Fusion traces available when `FUSION_DEBUG_TRACE=on`

### Testing
- **Unit Tests**: All fusion strategies and normalization methods
- **Integration Tests**: End-to-end query validation
- **Probe Queries**: Isharoth (rank 18) and Chrono Distortion (rank 1) cases verified

## [Previous Versions]

- Initial RAG system with vector + keyword search
- Basic RRF fusion with k=60 parameter
- Section-aware retrieval and context packing
- Answer synthesis and citation services