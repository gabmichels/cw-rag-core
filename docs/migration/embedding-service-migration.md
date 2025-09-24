# Embedding Service Migration Guide

## Overview

This guide covers migrating from the legacy character-based chunking system to the new token-aware, flexible embedding service architecture.

## Migration Strategy

### Phase 1: Immediate Fix (Hot Fix)
**Goal**: Stop 413 errors immediately without breaking existing functionality

**Changes**:
- Updated chunking logic in [`publishDocument`](../../apps/api/src/routes/ingest/publish.ts:489) to use token estimation
- Reduced default chunk size from 1500 chars to 460 tokens (~1470 chars)
- Enhanced error handling with emergency truncation fallback

**Environment Variables** (Optional):
```bash
# Immediate fix settings
EMBEDDING_MAX_TOKENS=460           # Conservative token limit
EMBEDDING_SAFETY_MARGIN=0.1        # 10% safety buffer
EMBEDDING_EMERGENCY_FALLBACK=true  # Enable emergency truncation
```

**Deployment**:
1. Deploy updated API code
2. No configuration changes required
3. Existing documents continue to work
4. New documents use improved chunking

### Phase 2: Enhanced Token Awareness (Recommended)
**Goal**: Full token-aware chunking with configurable strategies

**New Features**:
- Real token counting (BGE model optimized)
- Multiple chunking strategies (sentence-aware, paragraph-aware)
- Service capability detection
- Configuration management

**Environment Variables**:
```bash
# Token-aware configuration
EMBEDDING_PROVIDER=bge                    # Provider type
EMBEDDING_MODEL=bge-small-en-v1.5        # Model identifier
EMBEDDING_CHUNKING_STRATEGY=token-aware  # Chunking strategy
EMBEDDING_OVERLAP_TOKENS=50              # Context overlap
EMBEDDING_MIN_CHUNK_TOKENS=50            # Minimum chunk size

# Service configuration
EMBEDDING_RETRY_MAX_ATTEMPTS=3           # Retry attempts
EMBEDDING_TIMEOUT_MS=5000               # Request timeout
EMBEDDING_BATCH_SIZE=32                 # Batch processing size
```

**Migration Steps**:
1. Update environment variables in [`docker-compose.yml`](../../docker-compose.yml)
2. Restart services
3. Monitor logs for token awareness activation
4. Verify chunk sizes in structured logs

### Phase 3: Advanced Features (Future)
**Goal**: Production-ready features for large-scale deployments

**Features**:
- Multiple embedding service support (OpenAI, Azure, etc.)
- Dynamic configuration hot-reloading
- Advanced monitoring and metrics
- Semantic chunking strategies

## Backward Compatibility

### Existing API Endpoints
All existing endpoints continue to work unchanged:
- `POST /ingest/publish` - Enhanced chunking, same API
- `POST /ingest/preview` - Unchanged
- `POST /ask` - Unchanged

### Existing Documents
- Previously ingested documents remain accessible
- No re-indexing required
- New documents automatically use improved chunking

### Configuration Fallbacks
1. **No Environment Variables**: Uses safe defaults (460 tokens, token-aware chunking)
2. **Legacy Character Limits**: Automatically converts to token estimates
3. **Service Unavailable**: Falls back to Node.js embedding service

## Migration Validation

### Pre-Migration Checklist
- [ ] Backup existing Qdrant collections
- [ ] Test token counting with sample documents
- [ ] Verify environment variable formatting
- [ ] Review Docker service health checks

### Post-Migration Verification
- [ ] Check structured logs for token awareness activation
- [ ] Verify no 413 errors in embedding service
- [ ] Test document ingestion with various sizes
- [ ] Confirm chunk sizes are within limits

### Monitoring Commands
```bash
# Check embedding service health
curl http://localhost:8080/health

# Monitor API logs for chunking decisions
docker logs cw-rag-zenithfall-api | grep "StructuredLog:ChunkingDecision"

# Check Qdrant collection status
curl http://localhost:6333/collections/docs_v1
```

## Rollback Strategy

### Emergency Rollback
If issues occur, rollback steps:

1. **Environment Variable Rollback**:
```bash
# Disable new features
EMBEDDING_CHUNKING_STRATEGY=character
EMBEDDING_SAFETY_MARGIN=0.2
EMBEDDING_MAX_TOKENS=350
```

2. **Code Rollback**:
   - Revert to previous API image
   - Use legacy `createAdaptiveChunks` function

3. **Verification**:
   - Test document ingestion
   - Verify no errors in logs
   - Confirm system stability

### Gradual Rollback
For gradual feature disabling:

```bash
# Step 1: Increase safety margins
EMBEDDING_SAFETY_MARGIN=0.3

# Step 2: Reduce chunk sizes
EMBEDDING_MAX_TOKENS=300

# Step 3: Switch to character-based (if needed)
EMBEDDING_CHUNKING_STRATEGY=character
```

## Performance Impact

### Expected Improvements
- **95% reduction** in 413 errors
- **Better semantic coherence** in chunks
- **Adaptive chunk sizing** based on content

### Monitoring Metrics
- Chunk size distribution
- Token count accuracy
- Embedding generation time
- Error rate reduction

### Performance Baseline
Monitor these metrics before and after migration:
- Average chunk token count: Should be <460
- Embedding success rate: Should be >99%
- Document processing time: Similar or better
- Memory usage: Minimal increase for token counting cache

## Troubleshooting

### Common Issues

**Issue**: Still seeing 413 errors
**Solution**:
```bash
# Reduce token limit further
EMBEDDING_MAX_TOKENS=400
EMBEDDING_SAFETY_MARGIN=0.15
```

**Issue**: Chunks too small, losing context
**Solution**:
```bash
# Increase limits if embedding service allows
EMBEDDING_MAX_TOKENS=500
EMBEDDING_OVERLAP_TOKENS=75
```

**Issue**: Token counting seems inaccurate
**Solution**:
```bash
# Adjust character-to-token ratio for your content
EMBEDDING_CHAR_TO_TOKEN_RATIO=3.0  # More conservative
```

### Debug Mode
Enable detailed logging:
```bash
# API debug logging
LOG_LEVEL=debug

# Structured logging for chunking decisions
EMBEDDING_DEBUG_LOGGING=true
```

### Support Commands
```bash
# Test token counting manually
curl -X POST http://localhost:3000/debug/token-count \
  -H "Content-Type: application/json" \
  -d '{"text": "Your test text here"}'

# Get current configuration
curl http://localhost:3000/debug/embedding-config
```

## Configuration Examples

### Development Environment
```bash
# .env.development
EMBEDDING_MAX_TOKENS=512
EMBEDDING_CHUNKING_STRATEGY=token-aware
EMBEDDING_SAFETY_MARGIN=0.05
EMBEDDING_DEBUG_LOGGING=true
```

### Production Environment
```bash
# .env.production
EMBEDDING_MAX_TOKENS=460
EMBEDDING_CHUNKING_STRATEGY=token-aware
EMBEDDING_SAFETY_MARGIN=0.1
EMBEDDING_RETRY_MAX_ATTEMPTS=5
EMBEDDING_TIMEOUT_MS=10000
```

### High-Volume Environment
```bash
# .env.high-volume
EMBEDDING_MAX_TOKENS=450
EMBEDDING_BATCH_SIZE=64
EMBEDDING_CHUNKING_STRATEGY=paragraph
EMBEDDING_OVERLAP_TOKENS=25
```

## Success Criteria

### Migration Complete When:
- [ ] Zero 413 errors in embedding service
- [ ] All document types process successfully
- [ ] Chunk tokens consistently under limit
- [ ] Performance metrics maintained or improved
- [ ] Structured logs show token-aware decisions

### Quality Assurance
- Test with various document types (technical, narrative, structured)
- Verify chunk boundaries preserve sentence/paragraph integrity
- Confirm overlap maintains context between chunks
- Validate retrieval quality with chunked documents