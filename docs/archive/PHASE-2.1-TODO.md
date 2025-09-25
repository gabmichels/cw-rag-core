# PHASE 2.1 - High-Throughput Individual File Processing & Request Coordination

## 🎯 **Objective**
Implement robust, high-throughput document ingestion system for individual file trigger architecture capable of handling hundreds of concurrent file changes without overwhelming the API or losing data.

## 🚨 **Updated Critical Issues (Individual File Trigger Architecture)**
- **API Overwhelm Risk**: 250 file changes = 500 concurrent API calls (2 per file)
- **Rate Limit Bottleneck**: 10k/min API limit can be hit with bulk file operations
- **Workflow Scalability**: Each file change spawns separate n8n workflow execution
- **Resource Exhaustion**: High concurrent workflow executions = memory/CPU stress
- **Request Coordination**: No coordination between concurrent individual workflows
- **Data Consistency**: Concurrent updates to shared static data can cause corruption

## 📋 **Phase 2.1 Implementation Tasks**

### **1. Individual File Processing Architecture Optimization**
**Priority: CRITICAL** 🔴

#### **1.1 API Request Coordination & Throttling (IMPLEMENTED)**
```javascript
// IMPLEMENTED: Request throttling in n8n workflow
const requestTracker = staticData.requestTracker || { requests: [], windowMs: 60000 };
const maxRequestsPerMinute = 4000; // Conservative under 10k API limit

// Throttle when approaching limits
if (requestTracker.requests.length >= maxRequestsPerMinute) {
  await new Promise(resolve => setTimeout(resolve, waitTime));
}

// Track API calls per workflow execution
requestTracker.requests.push(now, now + 100); // preview + publish
```

#### **1.2 API Rate Limit Bypass for Local Traffic (IMPLEMENTED)**
```typescript
// IMPLEMENTED: Skip rate limits for Docker/local traffic
skip: (request: FastifyRequest) => {
  const ip = (request as any).ip || 'unknown';
  return ip === '127.0.0.1' || ip?.startsWith('172.') || ip?.startsWith('10.');
},
max: 10000, // Increased from 300 to 10k requests/minute
```

#### **1.3 Shared State Management & Data Consistency**
```javascript
// CRITICAL: Implement atomic operations for shared static data
const atomicUpdateFileHashes = (filePath, newHash) => {
  const staticData = $getWorkflowStaticData('global');
  const lockKey = `lock:${filePath}`;

  // Simple file-level locking to prevent corruption
  if (staticData[lockKey]) {
    console.log(`File ${filePath} is locked, skipping update`);
    return false;
  }

  staticData[lockKey] = Date.now();
  staticData.fileHashes = staticData.fileHashes || {};
  staticData.fileHashes[filePath] = newHash;
  delete staticData[lockKey];

  return true;
};
```

#### **1.4 Workflow Execution Monitoring & Circuit Breaker**
```javascript
// Monitor concurrent workflow executions
const executionTracker = {
  activeWorkflows: new Set(),
  maxConcurrent: 50,

  canExecute(workflowId) {
    return this.activeWorkflows.size < this.maxConcurrent;
  },

  register(workflowId) {
    this.activeWorkflows.add(workflowId);
  },

  complete(workflowId) {
    this.activeWorkflows.delete(workflowId);
  }
};
```

### **2. API Optimization for Individual File Processing**
**Priority: HIGH** 🟡

#### **2.1 Enhanced Rate Limiting (COMPLETED)**
```typescript
// COMPLETED: Updated rate limits for individual file processing
await fastify.register(rateLimitPlugin.default, {
  max: 10000,              // 10k requests per minute for high-throughput
  timeWindow: '1 minute',
  skip: (request: FastifyRequest) => {
    // Skip rate limiting for local/Docker traffic
    const ip = (request as any).ip;
    return ip === '127.0.0.1' || ip?.startsWith('172.') || ip?.startsWith('10.');
  }
});
```

#### **2.2 Request Batching & Coalescing (NEW REQUIREMENT)**
```typescript
// NEW: Implement request coalescing for rapid file changes
class RequestCoalescer {
  private pendingRequests = new Map<string, {
    document: NormalizedDoc,
    timestamp: number,
    resolve: Function,
    reject: Function
  }>();

  private batchTimeout = 500; // 500ms window for coalescing

  async submitDocument(doc: NormalizedDoc): Promise<void> {
    const key = `${doc.meta.tenant}:${doc.meta.docId}`;

    // Cancel previous request for same document
    if (this.pendingRequests.has(key)) {
      const existing = this.pendingRequests.get(key);
      existing.resolve({ status: 'superseded' });
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(key, {
        document: doc,
        timestamp: Date.now(),
        resolve,
        reject
      });

      // Process batch after timeout
      setTimeout(() => this.processBatch(), this.batchTimeout);
    });
  }

  private async processBatch() {
    const batch = Array.from(this.pendingRequests.values())
      .map(req => req.document);

    if (batch.length > 0) {
      await this.bulkProcess(batch);
      this.pendingRequests.clear();
    }
  }
}
```

#### **2.3 Bulk Processing Optimization**
```typescript
// Enhanced bulk endpoint for coalesced requests
fastify.post('/ingest/batch', {
  schema: {
    body: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          maxItems: 500,    // Reasonable batch size for individual file triggers
          items: NormalizedDocSchema
        },
        coalesced: { type: 'boolean' }, // Flag for coalesced requests
        priority: { type: 'string', enum: ['low', 'normal', 'high'] }
      }
    }
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

## 🎯 **Success Metrics (Individual File Architecture)**

### **Performance Targets**
- **Individual File Latency**: < 2 seconds per file (preview + publish)
- **Concurrent Handling**: 100+ simultaneous file changes without blocking
- **API Efficiency**: 95%+ request success rate under load
- **Resource Usage**: < 80% memory/CPU during bulk operations

### **Operational Metrics**
- **Request Queue Depth**: < 100 pending API calls
- **Workflow Execution Time**: < 10 seconds per file
- **Static Data Corruption**: 0% incidents
- **Rate Limit Hits**: < 1% for local traffic
- **Coalescing Efficiency**: 90%+ duplicate requests eliminated

## 🚀 **Implementation Timeline (Individual File Architecture)**

### **Week 1: Core Individual File Processing (PARTIALLY COMPLETED)**
- [x] Enhanced API rate limits for local traffic (10k/min)
- [x] Request throttling in n8n workflow
- [x] Proper tombstone SHA256 generation
- [ ] Atomic static data operations to prevent corruption
- [ ] Workflow execution monitoring and circuit breaker

### **Week 2: Request Optimization & Coalescing**
- [ ] Implement request coalescing for rapid file changes
- [ ] Add bulk processing endpoint for coalesced requests
- [ ] Optimize concurrent workflow execution limits
- [ ] Add workflow-level locking mechanisms

### **Week 3: Monitoring & Load Testing**
- [ ] Individual file processing performance monitoring
- [ ] Concurrent workflow execution tracking
- [ ] Load testing with 100+ simultaneous file changes
- [ ] Static data integrity validation

### **Week 4: Production Hardening & Scaling**
- [ ] Horizontal scaling: Multiple n8n worker instances
- [ ] Enhanced error handling for concurrent operations
- [ ] Performance tuning for high-frequency file operations
- [ ] Documentation for individual file trigger architecture

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

## 🎯 **Definition of Done (Individual File Architecture)**

✅ **System can handle 100+ concurrent file changes without blocking**
✅ **Individual file processing completes in < 2 seconds**
✅ **Zero static data corruption under concurrent access**
✅ **API rate limits effectively bypass local traffic**
✅ **Request coalescing eliminates 90%+ duplicate operations**
✅ **Load tested with rapid bulk file changes (500+ files in 1 minute)**
✅ **Comprehensive monitoring for concurrent workflow executions**

## 🔄 **Architecture Migration Notes**

### **Key Changes Made:**
1. **CRON → File Trigger**: Moved from scheduled batch processing to real-time individual file triggers
2. **Batch → Individual**: Each file change now spawns separate workflow execution
3. **Centralized → Distributed**: Processing logic distributed across many concurrent workflows

### **New Challenges Addressed:**
1. **API Overwhelm**: 10k/min rate limits + local traffic bypass + request throttling
2. **Concurrent State**: Atomic operations needed for shared static data
3. **Resource Management**: Circuit breaker for workflow execution limits
4. **Request Efficiency**: Coalescing for rapid successive changes to same file

### **Performance Implications:**
- **Latency**: Much lower (real-time vs 15-min cycles)
- **Throughput**: Higher potential but needs coordination
- **Scalability**: Horizontal scaling via multiple n8n workers
- **Complexity**: Higher due to concurrency management