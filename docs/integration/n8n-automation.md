# n8n Automation Architecture

## Introduction

n8n serves as the workflow automation engine in cw-rag-core, orchestrating document ingestion pipelines, data transformations, and external system integrations. This document details the automation architecture, workflow patterns, and integration strategies that make the RAG system flexible and extensible.

## n8n Role in RAG Architecture

### Automation Layer Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    External Data Sources                        │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   File      │  │     APIs    │  │   Databases │             │
│  │  Systems    │  │             │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────┬───────────────┬───────────────┬───────────────────┘
              │               │               │
              ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     n8n Workflow Engine                         │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Ingestion  │  │  Transform  │  │ Integration │             │
│  │  Workflows  │  │  Workflows  │  │  Workflows  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    cw-rag-core API                              │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Ingest    │  │   Process   │  │    Store    │             │
│  │  Endpoint   │  │  & Validate │  │  in Qdrant  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

**n8n Responsibilities**:
```typescript
interface N8NResponsibilities {
  // Data acquisition
  dataAcquisition: {
    fileMonitoring: "Monitor file systems for new documents";
    apiPolling: "Poll external APIs for content updates";
    webhookHandling: "Receive real-time data via webhooks";
    scheduledFetching: "Periodic data collection from sources";
  };

  // Data transformation
  dataTransformation: {
    formatNormalization: "Convert various formats to standard schema";
    contentCleaning: "Clean and sanitize input data";
    metadataExtraction: "Extract and enrich document metadata";
    validation: "Validate data before API submission";
  };

  // Integration orchestration
  integrationOrchestration: {
    apiCalls: "Make HTTP requests to cw-rag-core API";
    errorHandling: "Handle failures and implement retry logic";
    batchProcessing: "Process large volumes of documents efficiently";
    monitoring: "Monitor workflow execution and performance";
  };

  // External system integration
  externalIntegration: {
    thirdPartyAPIs: "Integrate with external content sources";
    databaseSyncing: "Sync with external databases";
    cloudStorage: "Access cloud storage systems";
    notifications: "Send alerts and notifications";
  };
}
```

### Workflow Architecture Patterns

**Event-Driven Processing**:
```typescript
interface EventDrivenPatterns {
  // Trigger patterns
  triggers: {
    webhook: {
      use_case: "Real-time document processing";
      example: "New file uploaded to cloud storage";
      latency: "Near real-time (seconds)";
    };

    schedule: {
      use_case: "Periodic batch processing";
      example: "Daily import from external database";
      latency: "Scheduled intervals";
    };

    manual: {
      use_case: "On-demand processing";
      example: "Manual workflow execution";
      latency: "Immediate";
    };

    apiCall: {
      use_case: "External system triggered";
      example: "Third-party system initiates processing";
      latency: "Near real-time";
    };
  };

  // Processing patterns
  processing: {
    sequential: "Process documents one by one";
    parallel: "Process multiple documents simultaneously";
    batch: "Process documents in batches";
    streaming: "Continuous stream processing";
  };

  // Integration patterns
  integration: {
    pullModel: "n8n pulls data from external sources";
    pushModel: "External sources push data to n8n";
    hybridModel: "Combination of pull and push";
  };
}
```

## Document Ingestion Workflows

### Baseline Ingestion Workflow

**Current Implementation Analysis**:
```json
// From n8n/workflows/ingest-baseline.json
{
  "name": "Document Ingestion Baseline",
  "nodes": [
    {
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger"
    },
    {
      "name": "Ingest Document",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "process.env.API_URL + '/ingest/normalize'",
        "method": "POST",
        "jsonBody": true,
        "bodyParameters": {
          "meta": {
            "tenant": "demo",
            "docId": "n8n-sample-doc",
            "acl": ["public", "demo-users"],
            "title": "n8n Workflow Sample Document",
            "source": "n8n-automation"
          },
          "text": "Sample document content..."
        }
      }
    },
    {
      "name": "Check Response Status",
      "type": "n8n-nodes-base.if"
    },
    {
      "name": "Success Handler",
      "type": "n8n-nodes-base.noOp"
    },
    {
      "name": "Error Handler",
      "type": "n8n-nodes-base.noOp"
    }
  ]
}
```

**Workflow Pattern Analysis**:
```typescript
interface BaselineWorkflowPattern {
  // Workflow structure
  structure: {
    trigger: "Manual trigger for testing/demonstration";
    processing: "Single HTTP request to API";
    errorHandling: "Conditional success/error handling";
    logging: "NoOp nodes for result logging";
  };

  // Data transformation
  transformation: {
    input: "Static sample data";
    normalization: "Direct mapping to API schema";
    validation: "Basic structure validation";
    output: "API-compatible JSON payload";
  };

  // Error handling
  errorHandling: {
    strategy: "Status code-based branching";
    retry: "No automatic retry in baseline";
    notification: "Log-based error notification";
    recovery: "Manual intervention required";
  };

  // Scalability considerations
  scalability: {
    throughput: "Single document per execution";
    concurrency: "No parallel processing";
    batching: "No batch optimization";
    efficiency: "Optimized for simplicity, not scale";
  };
}
```

### Advanced Ingestion Patterns

**Production-Ready Workflow Design**:
```typescript
interface ProductionIngestionWorkflow {
  // Enhanced trigger patterns
  advancedTriggers: {
    fileWatcher: {
      node: "n8n-nodes-base.fileWatch";
      purpose: "Monitor directory for new files";
      configuration: {
        watchDirectory: "/data/incoming";
        filePattern: "*.{pdf,docx,txt,md}";
        recursive: true;
      };
    };

    webhookTrigger: {
      node: "n8n-nodes-base.webhook";
      purpose: "Receive real-time notifications";
      configuration: {
        path: "/webhook/document-upload";
        method: "POST";
        authentication: "bearer-token";
      };
    };

    scheduledSync: {
      node: "n8n-nodes-base.cron";
      purpose: "Periodic data synchronization";
      configuration: {
        schedule: "0 */6 * * *";  // Every 6 hours
        timezone: "UTC";
      };
    };
  };

  // Data processing pipeline
  processingPipeline: {
    contentExtraction: {
      node: "n8n-nodes-base.code";
      purpose: "Extract text from various formats";
      implementation: "PDF parsing, DOCX extraction, etc.";
    };

    metadataEnrichment: {
      node: "n8n-nodes-base.function";
      purpose: "Enhance document metadata";
      enrichment: ["language detection", "content categorization"];
    };

    validation: {
      node: "n8n-nodes-base.code";
      purpose: "Validate document structure and content";
      checks: ["schema validation", "content quality", "size limits"];
    };

    transformation: {
      node: "n8n-nodes-base.set";
      purpose: "Transform to API-compatible format";
      mapping: "External format → cw-rag-core schema";
    };
  };

  // Error handling and recovery
  errorHandling: {
    retryLogic: {
      node: "n8n-nodes-base.errorTrigger";
      strategy: "Exponential backoff with jitter";
      maxRetries: 3;
      backoffMs: [1000, 5000, 15000];
    };

    deadLetterQueue: {
      node: "n8n-nodes-base.httpRequest";
      purpose: "Store failed documents for manual review";
      destination: "Dead letter storage system";
    };

    alerting: {
      node: "n8n-nodes-base.emailSend";
      purpose: "Notify administrators of failures";
      conditions: "Critical errors or high failure rates";
    };
  };
}
```

### Batch Processing Workflows

**High-Volume Document Processing**:
```typescript
interface BatchProcessingWorkflow {
  // Batch configuration
  batchConfig: {
    batchSize: 100;                    // Documents per batch
    concurrentBatches: 5;              // Parallel batch processing
    throttling: 1000;                  // MS delay between batches
    maxRetries: 3;                     // Retries per batch
  };

  // Workflow implementation
  implementation: {
    batchCreation: {
      node: "n8n-nodes-base.function";
      code: `
        // Split input into batches
        const batchSize = 100;
        const items = $input.all();
        const batches = [];

        for (let i = 0; i < items.length; i += batchSize) {
          batches.push(items.slice(i, i + batchSize));
        }

        return batches.map((batch, index) => ({
          json: { batchId: index, documents: batch }
        }));
      `;
    };

    parallelProcessing: {
      node: "n8n-nodes-base.splitInBatches";
      configuration: {
        batchSize: 1;                  // Process one batch at a time per branch
        options: {
          reset: false;
          continueOnFail: true;
        };
      };
    };

    batchSubmission: {
      node: "n8n-nodes-base.httpRequest";
      configuration: {
        url: "{{ $env.API_URL }}/ingest/normalize";
        method: "POST";
        body: "{{ $json.documents }}";
        timeout: 30000;                // 30 second timeout
      };
    };
  };

  // Progress tracking
  progressTracking: {
    batchStatus: {
      node: "n8n-nodes-base.set";
      purpose: "Track batch processing status";
      data: ["batchId", "status", "documentsProcessed", "errors"];
    };

    aggregateResults: {
      node: "n8n-nodes-base.merge";
      purpose: "Combine results from all batches";
      mode: "append";
    };

    finalReport: {
      node: "n8n-nodes-base.function";
      purpose: "Generate processing summary";
      output: "Total processed, success rate, error summary";
    };
  };
}
```

## External System Integration

### Content Source Integrations

**Common Integration Patterns**:
```typescript
interface ContentSourceIntegrations {
  // File system integration
  fileSystemIntegration: {
    localFileSystem: {
      nodes: ["fileWatch", "readBinaryFile", "moveBinaryData"];
      use_case: "Local document processing";
      patterns: ["Watch folder", "Batch import", "Archive processed"];
    };

    networkFileSystem: {
      nodes: ["ftp", "sftp", "samba"];
      use_case: "Remote file system access";
      patterns: ["Scheduled sync", "Real-time monitoring"];
    };

    cloudStorage: {
      nodes: ["googleDrive", "dropbox", "s3", "azureBlob"];
      use_case: "Cloud-based document storage";
      patterns: ["Webhook notifications", "Periodic sync"];
    };
  };

  // Database integration
  databaseIntegration: {
    relationalDB: {
      nodes: ["postgres", "mysql", "mssql", "oracle"];
      use_case: "Structured data as documents";
      patterns: ["Change data capture", "Scheduled exports"];
    };

    documentDB: {
      nodes: ["mongodb", "couchdb", "elasticsearch"];
      use_case: "Document-oriented data sources";
      patterns: ["Delta sync", "Full refresh"];
    };

    dataWarehouse: {
      nodes: ["snowflake", "bigquery", "redshift"];
      use_case: "Analytics data as knowledge base";
      patterns: ["ETL pipelines", "Scheduled reports"];
    };
  };

  // API integration
  apiIntegration: {
    restAPIs: {
      nodes: ["httpRequest", "webhook"];
      use_case: "Third-party content APIs";
      patterns: ["Polling", "Webhooks", "Pagination"];
    };

    graphqlAPIs: {
      nodes: ["graphql"];
      use_case: "GraphQL-based content sources";
      patterns: ["Subscription updates", "Batch queries"];
    };

    contentManagement: {
      nodes: ["wordpress", "drupal", "contentful", "strapi"];
      use_case: "CMS content integration";
      patterns: ["Publication hooks", "Content sync"];
    };
  };
}
```

### Real-Time Integration Patterns

**Event-Driven Content Processing**:
```typescript
interface RealTimeIntegration {
  // Webhook processing
  webhookProcessing: {
    incomingWebhook: {
      endpoint: "/webhook/content-update";
      security: "Bearer token authentication";
      processing: "Immediate document processing";
      response: "Synchronous success/error response";
    };

    webhookValidation: {
      signatureVerification: "Validate webhook signatures";
      sourceValidation: "Verify webhook source authenticity";
      contentValidation: "Validate webhook payload structure";
    };

    webhookRouting: {
      contentTypeRouting: "Route by document type";
      sourceRouting: "Route by source system";
      priorityRouting: "Priority-based processing queues";
    };
  };

  // Message queue integration
  messageQueueIntegration: {
    kafka: {
      node: "n8n-community-nodes.kafka";
      pattern: "Consume document events from Kafka topics";
      use_case: "High-throughput event processing";
    };

    rabbitmq: {
      node: "n8n-community-nodes.rabbitmq";
      pattern: "Queue-based document processing";
      use_case: "Reliable message processing";
    };

    awsSQS: {
      node: "n8n-nodes-base.awsSqs";
      pattern: "AWS-native message processing";
      use_case: "AWS ecosystem integration";
    };
  };

  // Stream processing
  streamProcessing: {
    realTimeData: {
      pattern: "Continuous stream of document updates";
      buffering: "Micro-batch processing for efficiency";
      backpressure: "Handle high-volume data streams";
    };

    changeDataCapture: {
      pattern: "Database change stream processing";
      implementation: "CDC tools → n8n → RAG system";
      use_case: "Real-time database sync";
    };
  };
}
```

## Workflow Development Patterns

### Modular Workflow Design

**Reusable Component Patterns**:
```typescript
interface ModularWorkflowDesign {
  // Shared sub-workflows
  sharedSubWorkflows: {
    documentValidation: {
      purpose: "Validate document structure and content";
      inputs: ["document object", "validation rules"];
      outputs: ["validation result", "error details"];
      reusability: "Used across all ingestion workflows";
    };

    metadataEnrichment: {
      purpose: "Enhance document metadata";
      inputs: ["raw document", "enrichment config"];
      outputs: ["enriched document"];
      reusability: "Common metadata processing";
    };

    errorHandling: {
      purpose: "Standardized error handling and reporting";
      inputs: ["error object", "context information"];
      outputs: ["error report", "recovery actions"];
      reusability: "Consistent error handling across workflows";
    };

    apiSubmission: {
      purpose: "Submit documents to cw-rag-core API";
      inputs: ["normalized documents", "API config"];
      outputs: ["submission results"];
      reusability: "Standard API interaction pattern";
    };
  };

  // Workflow composition
  workflowComposition: {
    templateWorkflows: {
      purpose: "Base templates for common patterns";
      types: ["file-ingestion", "api-sync", "batch-processing"];
      customization: "Parameter-driven customization";
    };

    workflowLibrary: {
      purpose: "Reusable workflow components";
      organization: "Categorized by function and data source";
      versioning: "Version control for workflow updates";
    };
  };
}
```

### Configuration Management

**Environment-Aware Configuration**:
```typescript
interface N8NConfiguration {
  // Environment variables
  environmentConfig: {
    api_endpoints: {
      development: "http://api:3000";
      staging: "https://staging-api.example.com";
      production: "https://api.example.com";
    };

    authentication: {
      api_keys: "Environment-specific API keys";
      webhookTokens: "Secure webhook authentication";
      certificates: "SSL/TLS certificates for secure communication";
    };

    processing_limits: {
      batchSize: "Environment-specific batch sizes";
      timeout: "Processing timeout configurations";
      retryLimits: "Retry attempt limits";
    };
  };

  // Workflow parameters
  workflowParameters: {
    dataSource: {
      type: "External system type";
      connectionString: "Source system connection details";
      credentials: "Authentication credentials";
      syncFrequency: "Data synchronization frequency";
    };

    processing: {
      transformationRules: "Data transformation configurations";
      validationRules: "Document validation rules";
      filterCriteria: "Content filtering criteria";
    };

    destination: {
      apiEndpoint: "Target API endpoint";
      tenantMapping: "Source to tenant mapping";
      metadataMapping: "Metadata field mapping";
    };
  };

  // Security configuration
  securityConfig: {
    encryption: {
      inTransit: "TLS configuration for API calls";
      atRest: "Encryption for sensitive workflow data";
      keyManagement: "Encryption key management";
    };

    access_control: {
      workflowPermissions: "Who can execute workflows";
      dataAccess: "Access controls for data sources";
      apiPermissions: "API access permissions";
    };
  };
}
```

## Monitoring and Observability

### Workflow Monitoring

**Execution Monitoring**:
```typescript
interface WorkflowMonitoring {
  // Execution metrics
  executionMetrics: {
    performance: {
      executionTime: "Workflow execution duration";
      throughput: "Documents processed per hour";
      latency: "End-to-end processing latency";
      resourceUsage: "CPU, memory, network utilization";
    };

    reliability: {
      successRate: "Percentage of successful executions";
      errorRate: "Percentage of failed executions";
      retryRate: "Percentage of executions requiring retries";
      availabilityUptime: "Workflow availability percentage";
    };

    quality: {
      dataQuality: "Quality of processed documents";
      validationFailures: "Document validation failure rate";
      duplicateDetection: "Duplicate document detection rate";
    };
  };

  // Real-time monitoring
  realTimeMonitoring: {
    dashboards: {
      execution_status: "Real-time workflow execution status";
      performance_metrics: "Live performance monitoring";
      error_tracking: "Real-time error tracking and alerting";
    };

    alerting: {
      threshold_alerts: "Alerts based on metric thresholds";
      anomaly_detection: "ML-based anomaly detection";
      escalation_policies: "Alert escalation procedures";
    };

    logging: {
      structured_logging: "JSON-structured log format";
      correlation_ids: "Trace requests across systems";
      audit_trails: "Complete audit trail for compliance";
    };
  };
}
```

### Performance Optimization

**Workflow Performance Tuning**:
```typescript
interface PerformanceOptimization {
  // Execution optimization
  executionOptimization: {
    parallelization: {
      strategy: "Parallel execution of independent tasks";
      implementation: "Split workflows for parallel processing";
      scaling: "Dynamic scaling based on workload";
    };

    caching: {
      nodeResult_caching: "Cache expensive operation results";
      data_caching: "Cache frequently accessed data";
      workflow_caching: "Cache workflow execution results";
    };

    resourceOptimization: {
      memory_management: "Optimize memory usage in workflows";
      connection_pooling: "Reuse database connections";
      batch_optimization: "Optimize batch sizes for throughput";
    };
  };

  // Scaling strategies
  scalingStrategies: {
    horizontal_scaling: {
      multiple_instances: "Run multiple n8n instances";
      load_balancing: "Distribute workflows across instances";
      shared_storage: "Shared workflow and data storage";
    };

    vertical_scaling: {
      resource_allocation: "Increase CPU/memory allocation";
      optimization: "Optimize resource-intensive operations";
      monitoring: "Monitor resource utilization";
    };

    queue_management: {
      priority_queues: "Priority-based workflow execution";
      backpressure_handling: "Handle high-volume scenarios";
      flow_control: "Control workflow execution flow";
    };
  };
}
```

## Integration Best Practices

### Security Best Practices

**Secure Workflow Development**:
```typescript
interface SecurityBestPractices {
  // Credential management
  credentialManagement: {
    encryption: "Encrypt all stored credentials";
    rotation: "Regular credential rotation";
    scope: "Limit credential scope to minimum required";
    audit: "Audit credential usage";
  };

  // Data protection
  dataProtection: {
    encryption_in_transit: "Encrypt all API communications";
    data_sanitization: "Sanitize sensitive data in logs";
    pii_handling: "Special handling for PII data";
    retention_policies: "Data retention and deletion policies";
  };

  // Access control
  accessControl: {
    workflow_permissions: "Role-based workflow access";
    execution_permissions: "Control workflow execution rights";
    data_access: "Limit data access to authorized users";
    api_security: "Secure API integrations";
  };

  // Compliance
  compliance: {
    gdpr: "GDPR compliance for EU data";
    hipaa: "HIPAA compliance for healthcare data";
    sox: "SOX compliance for financial data";
    audit_logging: "Comprehensive audit logging";
  };
}
```

### Error Handling Best Practices

**Robust Error Management**:
```typescript
interface ErrorHandlingBestPractices {
  // Error classification
  errorClassification: {
    transient_errors: {
      examples: ["Network timeouts", "Rate limits"];
      handling: "Automatic retry with exponential backoff";
      recovery: "Usually recoverable";
    };

    permanent_errors: {
      examples: ["Invalid credentials", "Malformed data"];
      handling: "Immediate failure notification";
      recovery: "Manual intervention required";
    };

    system_errors: {
      examples: ["Out of memory", "Disk full"];
      handling: "System-level alerting";
      recovery: "Infrastructure fixes required";
    };
  };

  // Recovery strategies
  recoveryStrategies: {
    automatic_retry: {
      strategy: "Exponential backoff with jitter";
      limits: "Maximum retry attempts and duration";
      conditions: "Retry only for recoverable errors";
    };

    circuit_breaker: {
      pattern: "Circuit breaker for failing systems";
      implementation: "Fail fast when system is down";
      recovery: "Automatic recovery detection";
    };

    fallback_processing: {
      strategy: "Alternative processing paths";
      implementation: "Graceful degradation";
      quality: "Maintain service quality during failures";
    };
  };

  // Notification and alerting
  alerting: {
    immediate_alerts: "Critical errors require immediate attention";
    batch_reports: "Regular error summary reports";
    escalation: "Automatic escalation for unresolved issues";
    integration: "Integration with incident management systems";
  };
}
```

---

**Next**: Learn about [Docker Strategy](docker-strategy.md) and containerization design for the RAG system.