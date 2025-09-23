# PHASE 2.1 - High-Throughput Ingestion & Queue Management

## 🎯 **Objective**
Implement robust, high-throughput document ingestion system capable of handling tenant onboarding scenarios with thousands of files without data loss or artificial rate limiting.

## 🚨 **Current Critical Issues**
- **Data Loss Risk**: Failed batches permanently lost (no retry queue)
- **Low Throughput**: 50 files per 15-min run = 200 files/hour max
- **Memory-Only State**: Workflow crash = total data loss
- **No Failure Recovery**: Rate limit hits = remaining batches discarded
- **Onboarding Bottleneck**: 5000 files = 25+ hours to ingest

## 📋 **Phase 2.1 Implementation Tasks**

### **1. High-Throughput N8N Workflow Enhancement**
**Priority: CRITICAL** 🔴

#### **1.1 Remove Artificial Limits**
```javascript
// Current restrictive limits:
maxFiles: 50,              // REMOVE - Process all available
batchSize: 5,              // INCREASE to 25-50 for efficiency
maxBatchesPerRun: 10,      // INCREASE to 100+ for throughput

// New high-throughput configuration:
maxFiles: 999999,          // No artificial file limit
batchSize: 25,             // Larger batches = fewer API calls
maxBatchesPerRun: 200,     // Process 5000 files per run
concurrentBatches: 5,      // Parallel processing
```

#### **1.2 Implement Persistent Processing Queue**
```javascript
// Workflow Static Data Structure:
$workflow.staticData = {
  processingQueue: {
    pending: [],           // Files waiting to be processed
    processing: [],        // Currently being processed
    failed: [],            // Failed batches for retry
    completed: []          // Successfully processed (for audit)
  },
  retryManager: {
    maxRetries: 5,
    retryDelay: 2000,      // Start with 2 seconds
    exponentialBackoff: true
  },
  metrics: {
    totalFiles: 0,
    processedFiles: 0,
    failedFiles: 0,
    avgProcessingTime: 0
  }
}
```

#### **1.3 Add Batch-Level Retry Logic**
```javascript
// Retry failed batches with exponential backoff
function addToRetryQueue(batch, error, attempt = 1) {
  const retryDelay = Math.min(2000 * Math.pow(2, attempt-1), 30000); // Max 30s
  const nextRetry = Date.now() + retryDelay;

  $workflow.staticData.processingQueue.failed.push({
    batch: batch,
    error: error.message,
    attempt: attempt,
    nextRetry: nextRetry,
    originalTimestamp: new Date().toISOString()
  });
}
```

### **2. API Rate Limiting Optimization**
**Priority: HIGH** 🟡

#### **2.1 Remove Local Rate Limits for High-Throughput**
```typescript
// apps/api/src/routes/ingest/index.ts
await fastify.register(rateLimitPlugin.default, {
  max: 10000,              // 10k requests per minute for local processing
  timeWindow: '1 minute',
  // Skip rate limiting for localhost/Docker internal traffic
  skip: (request: FastifyRequest) => {
    const ip = (request as any).ip;
    return ip === '127.0.0.1' ||
           ip === '::1' ||
           ip?.startsWith('172.') ||  // Docker networks
           ip?.startsWith('10.');     // Private networks
  }
});
```

#### **2.2 Add Bulk Ingestion Endpoint**
```typescript
// New endpoint: POST /ingest/bulk
// Accepts arrays of 100+ documents for efficient processing
fastify.post('/bulk', {
  schema: {
    body: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          maxItems: 1000,    // Process up to 1000 docs per request
          items: NormalizedDocSchema
        },
        tenant: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] }
      }
    }
  },
  handler: async (request, reply) => {
    // Parallel processing with configurable concurrency
    const results = await Promise.allSettled(
      chunk(documents, 50).map(batch => processBatch(batch))
    );

    return {
      total: documents.length,
      processed: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      errors: results.filter(r => r.status === 'rejected').map(r => r.reason)
    };
  }
});
```

### **3. Queue Management System**
**Priority: HIGH** 🟡

#### **3.1 Persistent Queue with Redis (Optional)**
```typescript
// For production: Use Redis for queue persistence
interface QueueManager {
  addBatch(batch: NormalizedDoc[]): Promise<string>;
  getBatch(): Promise<NormalizedDoc[] | null>;
  markCompleted(batchId: string): Promise<void>;
  markFailed(batchId: string, error: string): Promise<void>;
  getQueueStats(): Promise<QueueStats>;
}

// Fallback: File-based queue for development
const QUEUE_FILE = '/data/ingestion-queue.json';
```

#### **3.2 Queue Processing Logic**
```javascript
// Priority-based queue processing
async function processQueue() {
  // 1. Process retry queue first (failed batches)
  const retryBatches = getRetryableBatches();
  await processRetryBatches(retryBatches);

  // 2. Process new files by priority
  const newBatches = createBatchesFromPendingFiles();
  await processNewBatches(newBatches);

  // 3. Update metrics and state
  updateProcessingMetrics();
}
```

### **4. Monitoring & Alerting**
**Priority: MEDIUM** 🟢

#### **4.1 Queue Health Monitoring**
```javascript
// Monitor queue depth and processing rates
const queueMetrics = {
  pendingFiles: queue.pending.length,
  failedBatches: queue.failed.length,
  processingRate: calculateFilesPerMinute(),
  estimatedCompletionTime: calculateETA(),
  errorRate: calculateErrorRate()
};

// Alert thresholds
if (queueMetrics.pendingFiles > 10000) {
  console.warn(`HIGH QUEUE DEPTH: ${queueMetrics.pendingFiles} files pending`);
}
if (queueMetrics.errorRate > 0.1) {
  console.error(`HIGH ERROR RATE: ${queueMetrics.errorRate * 100}% failing`);
}
```

#### **4.2 Progress Tracking for Large Onboarding**
```javascript
// Tenant onboarding progress tracking
const onboardingMetrics = {
  tenantId: 'new-tenant-2024',
  totalFiles: 5000,
  processedFiles: 1250,
  failedFiles: 15,
  progressPercent: 25,
  estimatedTimeRemaining: '45 minutes',
  avgFilesPerMinute: 83.3
};
```

### **5. Configuration for High-Throughput**
**Priority: HIGH** 🟡

#### **5.1 Environment Variables**
```env
# High-throughput configuration
BATCH_SIZE=50                    # Larger batches for efficiency
MAX_FILES_PER_RUN=999999        # No artificial limits
MAX_BATCHES_PER_RUN=200         # Process 10k files per run
CONCURRENT_BATCHES=10           # Parallel processing
MAX_RETRIES=5                   # Robust retry logic
RETRY_DELAY_MS=2000            # Starting retry delay
ENABLE_BULK_ENDPOINT=true       # Enable bulk ingestion
SKIP_RATE_LIMITS_LOCAL=true     # Skip limits for local processing
```

#### **5.2 Docker Resource Allocation**
```yaml
# docker-compose.yml - Increase resources for high-throughput
api:
  deploy:
    resources:
      limits:
        memory: 4G              # Increased from 1G
        cpus: '2.0'            # Increased from 1.0
  environment:
    - NODE_OPTIONS=--max-old-space-size=3072  # 3GB heap
```

### **6. Testing Strategy**
**Priority: MEDIUM** 🟢

#### **6.1 Load Testing Scenarios**
```javascript
// Test scenarios for validation
const testScenarios = [
  {
    name: 'Small Onboarding',
    fileCount: 100,
    expectedTime: '< 2 minutes',
    expectedSuccessRate: '> 99%'
  },
  {
    name: 'Medium Onboarding',
    fileCount: 1000,
    expectedTime: '< 15 minutes',
    expectedSuccessRate: '> 99%'
  },
  {
    name: 'Large Onboarding',
    fileCount: 10000,
    expectedTime: '< 2 hours',
    expectedSuccessRate: '> 98%'
  }
];
```

#### **6.2 Failure Recovery Testing**
```javascript
// Test failure scenarios
const failureTests = [
  'API timeout during batch processing',
  'Qdrant connection failure',
  'Workflow execution interruption',
  'Memory exhaustion with large files',
  'Rate limit simulation'
];
```

## 🎯 **Success Metrics**

### **Performance Targets**
- **Throughput**: 1000+ files per hour
- **Reliability**: 99%+ success rate
- **Recovery**: Zero data loss on failures
- **Onboarding**: 5000 files < 2 hours

### **Operational Metrics**
- Queue depth < 1000 files
- Error rate < 1%
- Memory usage < 80%
- Processing latency < 30s per batch

## 🚀 **Implementation Timeline**

### **Week 1: Core Queue System**
- [ ] Remove artificial file limits
- [ ] Implement persistent queue in workflow static data
- [ ] Add batch retry logic with exponential backoff
- [ ] Increase batch sizes and concurrency

### **Week 2: API Optimization**
- [ ] Remove rate limits for local/Docker traffic
- [ ] Implement bulk ingestion endpoint
- [ ] Add parallel batch processing
- [ ] Optimize Qdrant upsert operations

### **Week 3: Monitoring & Testing**
- [ ] Implement queue health monitoring
- [ ] Add progress tracking for onboarding
- [ ] Create load testing scenarios
- [ ] Validate failure recovery mechanisms

### **Week 4: Production Hardening**
- [ ] Add alerting for queue issues
- [ ] Implement graceful degradation
- [ ] Performance tuning and optimization
- [ ] Documentation and runbooks

## 🔧 **Technical Notes**

### **Memory Management**
- Use streaming for large files
- Implement garbage collection between batches
- Monitor heap usage during processing

### **Error Handling**
- Distinguish between retryable and permanent failures
- Implement circuit breaker for cascading failures
- Log detailed error context for debugging

### **Scalability Considerations**
- Horizontal scaling: Multiple n8n workers
- Vertical scaling: Increased container resources
- Database scaling: Qdrant cluster for large volumes

## 🎯 **Definition of Done**

✅ **System can ingest 5000 files in under 2 hours**
✅ **Zero data loss on workflow failures**
✅ **Automatic retry of failed batches**
✅ **Real-time progress tracking**
✅ **Load tested with 10k+ files**
✅ **Comprehensive error monitoring**