# Extension Points

## Introduction

The cw-rag-core system is designed with extensibility as a core principle, providing multiple well-defined extension points that allow developers to enhance functionality, integrate new services, and customize behavior without modifying core system components. This document details the available extension points and provides guidance on implementing extensions safely and effectively.

## Extension Architecture Philosophy

### Extensibility Principles

**Plugin-Based Architecture**:
```typescript
interface ExtensibilityPrinciples {
  // Modular design
  modularDesign: {
    principle: "Core functionality separate from extensions";
    benefits: ["Independent development", "Easy testing", "Isolated failures"];
    implementation: "Interface-based extension points";
  };

  // Backward compatibility
  backwardCompatibility: {
    principle: "Extensions should not break with core updates";
    strategy: "Stable APIs with versioning";
    deprecation: "Gradual deprecation with migration paths";
  };

  // Configuration-driven
  configurationDriven: {
    principle: "Extensions configured, not coded";
    benefits: ["No code changes", "Runtime configuration", "Easy deployment"];
    implementation: "JSON/YAML configuration files";
  };

  // Security-first
  securityFirst: {
    principle: "Extensions cannot compromise system security";
    enforcement: "Sandboxing and permission systems";
    validation: "Input/output validation at boundaries";
  };
}
```

### Extension Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                        Extension Points                         │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Embedding  │  │    LLM      │  │   Data      │             │
│  │  Services   │  │ Integration │  │  Sources    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Search    │  │    Auth     │  │  Workflow   │             │
│  │ Enhancement │  │ Providers   │  │   Nodes     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Monitoring  │  │   Storage   │  │  Frontend   │             │
│  │ & Analytics │  │ Backends    │  │ Components  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Embedding Service Extensions

### Embedding Service Interface

**Core Extension Point**:
```typescript
// From packages/retrieval/src/embedding.ts
export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedDocument(document: Document): Promise<number[]>;
}

// Extended interface for production implementations
export interface ExtendedEmbeddingService extends EmbeddingService {
  // Model information
  getModelInfo(): ModelInfo;

  // Batch processing
  embedBatch(texts: string[]): Promise<number[][]>;

  // Configuration
  configure(config: EmbeddingConfig): void;

  // Health and monitoring
  healthCheck(): Promise<boolean>;
  getMetrics(): EmbeddingMetrics;
}
```

**Implementation Examples**:

**OpenAI Embedding Service**:
```typescript
import OpenAI from 'openai';

export class OpenAIEmbeddingService implements ExtendedEmbeddingService {
  private client: OpenAI;
  private model = 'text-embedding-ada-002';

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey
    });
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new EmbeddingError(`OpenAI embedding failed: ${error.message}`);
    }
  }

  async embedDocument(document: Document): Promise<number[]> {
    // Implement document-specific preprocessing
    const processedText = this.preprocessDocument(document);
    return this.embed(processedText);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Implement batch processing with rate limiting
    const batchSize = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        encoding_format: 'float'
      });

      results.push(...response.data.map(item => item.embedding));
    }

    return results;
  }

  getModelInfo(): ModelInfo {
    return {
      name: 'text-embedding-ada-002',
      dimension: 1536,
      maxTokens: 8192,
      provider: 'OpenAI'
    };
  }

  private preprocessDocument(document: Document): string {
    // Implement document-specific preprocessing
    return document.content.trim();
  }
}
```

**Hugging Face Embedding Service**:
```typescript
export class HuggingFaceEmbeddingService implements ExtendedEmbeddingService {
  private modelName = 'sentence-transformers/all-MiniLM-L6-v2';
  private apiUrl: string;

  constructor(config: HuggingFaceConfig) {
    this.apiUrl = config.apiUrl || 'https://api-inference.huggingface.co';
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.apiUrl}/pipeline/feature-extraction/${this.modelName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true }
      })
    });

    if (!response.ok) {
      throw new EmbeddingError(`HuggingFace API error: ${response.statusText}`);
    }

    const embedding = await response.json();
    return embedding;
  }

  getModelInfo(): ModelInfo {
    return {
      name: this.modelName,
      dimension: 384,
      maxTokens: 512,
      provider: 'Hugging Face'
    };
  }
}
```

### Embedding Service Registration

**Service Registry Pattern**:
```typescript
// Extension registration system
interface EmbeddingServiceRegistry {
  register(name: string, factory: EmbeddingServiceFactory): void;
  create(name: string, config: any): EmbeddingService;
  list(): string[];
}

class DefaultEmbeddingServiceRegistry implements EmbeddingServiceRegistry {
  private services = new Map<string, EmbeddingServiceFactory>();

  register(name: string, factory: EmbeddingServiceFactory): void {
    this.services.set(name, factory);
  }

  create(name: string, config: any): EmbeddingService {
    const factory = this.services.get(name);
    if (!factory) {
      throw new Error(`Unknown embedding service: ${name}`);
    }
    return factory(config);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

// Register embedding services
const embeddingRegistry = new DefaultEmbeddingServiceRegistry();
embeddingRegistry.register('openai', (config) => new OpenAIEmbeddingService(config));
embeddingRegistry.register('huggingface', (config) => new HuggingFaceEmbeddingService(config));
embeddingRegistry.register('cohere', (config) => new CohereEmbeddingService(config));
```

## LLM Integration Extensions

### Answer Generation Extension Point

**LLM Service Interface**:
```typescript
export interface LLMService {
  // Basic generation
  generateAnswer(
    query: string,
    context: Document[],
    options?: GenerationOptions
  ): Promise<GeneratedAnswer>;

  // Streaming generation
  generateAnswerStream(
    query: string,
    context: Document[],
    options?: GenerationOptions
  ): AsyncIterable<GenerationChunk>;

  // Model information
  getModelInfo(): LLMModelInfo;

  // Configuration
  configure(config: LLMConfig): void;
}

interface GeneratedAnswer {
  answer: string;
  confidence: number;
  sources: SourceCitation[];
  metadata: GenerationMetadata;
}

interface SourceCitation {
  documentId: string;
  excerpt: string;
  relevanceScore: number;
}
```

**GPT-4 Implementation Example**:
```typescript
export class GPT4LLMService implements LLMService {
  private client: OpenAI;
  private model = 'gpt-4.1-2025-04-14';

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey
    });
  }

  async generateAnswer(
    query: string,
    context: Document[],
    options: GenerationOptions = {}
  ): Promise<GeneratedAnswer> {
    const prompt = this.buildPrompt(query, context, options);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.1,
      max_tokens: options.maxTokens || 1000,
      presence_penalty: 0,
      frequency_penalty: 0
    });

    const answer = response.choices[0].message.content;
    const sources = this.extractSources(answer, context);

    return {
      answer: this.cleanAnswer(answer),
      confidence: this.calculateConfidence(response),
      sources,
      metadata: {
        model: this.model,
        tokens: response.usage?.total_tokens || 0,
        processingTime: Date.now() - startTime
      }
    };
  }

  private buildPrompt(query: string, context: Document[], options: GenerationOptions): string {
    const contextText = context
      .map((doc, idx) => `[${idx + 1}] ${doc.content}`)
      .join('\n\n');

    return `
Context:
${contextText}

Question: ${query}

Instructions:
- Answer the question based only on the provided context
- If the context doesn't contain enough information, say so
- Cite your sources using [1], [2], etc. referring to the context documents
- Be precise and factual
- Structure your answer clearly

Answer:`;
  }

  private getSystemPrompt(): string {
    return `You are a helpful AI assistant that answers questions based on provided context.
You always cite your sources and only use information from the provided context.`;
  }
}
```

### LLM Service Integration

**Service Integration Pattern**:
```typescript
// Integrate LLM service into RAG pipeline
class RAGService {
  constructor(
    private embeddingService: EmbeddingService,
    private vectorDB: VectorDBClient,
    private llmService?: LLMService  // Optional for Phase 2
  ) {}

  async ask(query: string, userContext: UserContext): Promise<AskResponse> {
    // 1. Vector search for relevant documents
    const queryVector = await this.embeddingService.embed(query);
    const searchResults = await this.vectorDB.search(queryVector, userContext);

    // 2. Generate answer if LLM service is available
    let answer: string;
    if (this.llmService) {
      const generatedAnswer = await this.llmService.generateAnswer(
        query,
        searchResults.map(r => r.document)
      );
      answer = generatedAnswer.answer;
    } else {
      answer = "Phase-0 stub answer: This is a placeholder response based on your query.";
    }

    return {
      answer,
      retrievedDocuments: searchResults,
      queryId: `qid-${Date.now()}`
    };
  }
}
```

## Data Source Extensions

### Custom Data Source Interface

**Data Source Connector Pattern**:
```typescript
export interface DataSourceConnector {
  // Connection management
  connect(config: DataSourceConfig): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;

  // Data retrieval
  listDocuments(filter?: DocumentFilter): Promise<ExternalDocument[]>;
  getDocument(id: string): Promise<ExternalDocument>;
  getDocumentStream(filter?: DocumentFilter): AsyncIterable<ExternalDocument>;

  // Change detection
  getChanges(since: Date): Promise<DocumentChange[]>;
  subscribeToChanges(callback: ChangeCallback): Promise<void>;

  // Metadata
  getSourceInfo(): DataSourceInfo;
}

interface ExternalDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  lastModified: Date;
  checksum?: string;
}

interface DocumentChange {
  type: 'created' | 'updated' | 'deleted';
  document: ExternalDocument;
  timestamp: Date;
}
```

**Example: SharePoint Connector**:
```typescript
export class SharePointConnector implements DataSourceConnector {
  private client: SharePointClient;
  private config: SharePointConfig;

  async connect(config: SharePointConfig): Promise<void> {
    this.config = config;
    this.client = new SharePointClient({
      siteUrl: config.siteUrl,
      credentials: config.credentials
    });

    await this.client.authenticate();
  }

  async *getDocumentStream(filter?: DocumentFilter): AsyncIterable<ExternalDocument> {
    const libraries = await this.client.getDocumentLibraries();

    for (const library of libraries) {
      const documents = await this.client.getDocuments(library.id, filter);

      for (const doc of documents) {
        if (this.shouldIncludeDocument(doc, filter)) {
          yield {
            id: doc.id,
            content: await this.extractContent(doc),
            metadata: {
              title: doc.title,
              author: doc.author,
              created: doc.created,
              modified: doc.modified,
              library: library.name,
              url: doc.webUrl,
              fileType: doc.fileType
            },
            lastModified: doc.modified,
            checksum: doc.etag
          };
        }
      }
    }
  }

  async getChanges(since: Date): Promise<DocumentChange[]> {
    const changes = await this.client.getChangeLog(since);
    return changes.map(change => ({
      type: change.changeType,
      document: change.document,
      timestamp: change.timestamp
    }));
  }

  private async extractContent(document: SharePointDocument): Promise<string> {
    const fileBuffer = await this.client.downloadFile(document.id);

    switch (document.fileType.toLowerCase()) {
      case 'pdf':
        return await this.extractPDFText(fileBuffer);
      case 'docx':
        return await this.extractWordText(fileBuffer);
      case 'txt':
        return fileBuffer.toString('utf-8');
      default:
        return document.title; // Fallback to title
    }
  }
}
```

### n8n Custom Nodes

**Custom n8n Node Development**:
```typescript
// Custom n8n node for cw-rag-core integration
import { IExecuteFunctions } from 'n8n-core';
import {
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';

export class CWRagIngest implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'CW RAG Ingest',
    name: 'cwRagIngest',
    group: ['transform'],
    version: 1,
    description: 'Ingest documents into CW RAG Core system',
    defaults: {
      name: 'CW RAG Ingest',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'API Endpoint',
        name: 'apiEndpoint',
        type: 'string',
        default: 'http://api:3000',
        required: true,
        description: 'CW RAG Core API endpoint',
      },
      {
        displayName: 'Tenant ID',
        name: 'tenantId',
        type: 'string',
        default: '',
        required: true,
        description: 'Tenant identifier for multi-tenant deployment',
      },
      {
        displayName: 'Default ACL',
        name: 'defaultAcl',
        type: 'string',
        default: 'public',
        description: 'Default access control list',
      }
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const apiEndpoint = this.getNodeParameter('apiEndpoint', 0) as string;
    const tenantId = this.getNodeParameter('tenantId', 0) as string;
    const defaultAcl = this.getNodeParameter('defaultAcl', 0) as string;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Transform input to CW RAG format
      const document = {
        content: item.json.content || item.json.text,
        metadata: {
          tenantId,
          docId: item.json.id || `doc-${Date.now()}-${i}`,
          acl: item.json.acl || [defaultAcl],
          ...item.json.metadata
        }
      };

      // Submit to CW RAG API
      const response = await this.helpers.httpRequest({
        method: 'POST',
        url: `${apiEndpoint}/ingest/normalize`,
        body: { documents: [document] },
        json: true,
      });

      returnData.push({
        json: {
          success: response.success,
          documentId: response.documentIds[0],
          originalItem: item.json
        }
      });
    }

    return [returnData];
  }
}
```

## Search Enhancement Extensions

### Custom Search Processors

**Search Enhancement Interface**:
```typescript
export interface SearchProcessor {
  // Query processing
  processQuery(query: string, context: SearchContext): Promise<ProcessedQuery>;

  // Result processing
  processResults(
    results: SearchResult[],
    query: ProcessedQuery
  ): Promise<SearchResult[]>;

  // Configuration
  configure(config: SearchProcessorConfig): void;

  // Metadata
  getInfo(): SearchProcessorInfo;
}

interface ProcessedQuery {
  originalQuery: string;
  expandedTerms: string[];
  filters: SearchFilter[];
  intent: QueryIntent;
  language: string;
}

interface SearchResult {
  document: Document;
  score: number;
  explanation?: string;
  highlights?: TextHighlight[];
}
```

**Query Expansion Processor**:
```typescript
export class QueryExpansionProcessor implements SearchProcessor {
  private synonymService: SynonymService;
  private embeddings: EmbeddingService;

  async processQuery(query: string, context: SearchContext): Promise<ProcessedQuery> {
    // 1. Extract key terms
    const keyTerms = await this.extractKeyTerms(query);

    // 2. Find synonyms
    const synonyms = await this.findSynonyms(keyTerms);

    // 3. Semantic expansion using embeddings
    const semanticTerms = await this.findSemanticTerms(query);

    // 4. Combine expansions
    const expandedTerms = [...keyTerms, ...synonyms, ...semanticTerms];

    return {
      originalQuery: query,
      expandedTerms,
      filters: context.filters || [],
      intent: await this.classifyIntent(query),
      language: await this.detectLanguage(query)
    };
  }

  async processResults(
    results: SearchResult[],
    query: ProcessedQuery
  ): Promise<SearchResult[]> {
    // Re-rank results based on expanded query terms
    return results.map(result => ({
      ...result,
      score: this.recalculateScore(result, query),
      explanation: this.generateExplanation(result, query)
    }));
  }

  private async findSemanticTerms(query: string): Promise<string[]> {
    const queryEmbedding = await this.embeddings.embed(query);
    // Find semantically similar terms from knowledge base
    return this.findSimilarTerms(queryEmbedding);
  }
}
```

**Result Reranking Processor**:
```typescript
export class RerankingProcessor implements SearchProcessor {
  private rerankingModel: RerankingModel;

  async processResults(
    results: SearchResult[],
    query: ProcessedQuery
  ): Promise<SearchResult[]> {
    // Use neural reranking model
    const rerankingScores = await this.rerankingModel.rerank(
      query.originalQuery,
      results.map(r => r.document.content)
    );

    // Combine original scores with reranking scores
    return results.map((result, index) => ({
      ...result,
      score: this.combineScores(result.score, rerankingScores[index]),
      explanation: `Reranked: original=${result.score.toFixed(3)}, rerank=${rerankingScores[index].toFixed(3)}`
    })).sort((a, b) => b.score - a.score);
  }

  private combineScores(vectorScore: number, rerankScore: number): number {
    // Weighted combination of scores
    return 0.7 * vectorScore + 0.3 * rerankScore;
  }
}
```

## Authentication Extensions

### Authentication Provider Interface

**Auth Provider Extension Point**:
```typescript
export interface AuthenticationProvider {
  // Authentication
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
  validateToken(token: string): Promise<ValidationResult>;
  refreshToken(refreshToken: string): Promise<AuthResult>;

  // User information
  getUserInfo(userId: string): Promise<UserInfo>;
  getUserGroups(userId: string): Promise<GroupInfo[]>;

  // Configuration
  configure(config: AuthConfig): void;

  // Provider info
  getProviderInfo(): AuthProviderInfo;
}

interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  userInfo?: UserInfo;
  error?: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  groups: string[];
  roles: string[];
  metadata?: Record<string, any>;
}
```

**SAML Authentication Provider**:
```typescript
export class SAMLAuthProvider implements AuthenticationProvider {
  private samlStrategy: SamlStrategy;

  constructor(config: SAMLConfig) {
    this.samlStrategy = new SamlStrategy({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.certificate,
      callbackUrl: config.callbackUrl
    });
  }

  async authenticate(credentials: SAMLCredentials): Promise<AuthResult> {
    try {
      const profile = await this.samlStrategy.authenticate(credentials.assertion);

      const userInfo: UserInfo = {
        id: profile.nameID,
        email: profile.email,
        name: profile.displayName,
        tenantId: this.extractTenantId(profile),
        groups: this.extractGroups(profile),
        roles: this.extractRoles(profile)
      };

      const token = await this.generateJWT(userInfo);

      return {
        success: true,
        token,
        expiresIn: 3600, // 1 hour
        userInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async validateToken(token: string): Promise<ValidationResult> {
    try {
      const decoded = jwt.verify(token, this.getJWTSecret());
      return {
        valid: true,
        userInfo: decoded as UserInfo
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}
```

## Monitoring Extensions

### Custom Metrics and Analytics

**Metrics Extension Interface**:
```typescript
export interface MetricsCollector {
  // Metric collection
  recordQuery(query: string, userContext: UserContext, duration: number): void;
  recordResult(queryId: string, results: SearchResult[]): void;
  recordUserAction(action: UserAction): void;

  // Custom metrics
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;

  // Export metrics
  getMetrics(): Promise<MetricData[]>;
  exportPrometheus(): Promise<string>;
}

interface MetricData {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}
```

**Custom Analytics Processor**:
```typescript
export class RAGAnalyticsProcessor implements MetricsCollector {
  private metrics = new Map<string, MetricData>();

  recordQuery(query: string, userContext: UserContext, duration: number): void {
    // Record query metrics
    this.incrementCounter('rag_queries_total', {
      tenant: userContext.tenantId,
      user: userContext.id
    });

    this.recordHistogram('rag_query_duration_ms', duration, {
      tenant: userContext.tenantId
    });

    // Analyze query patterns
    this.analyzeQueryComplexity(query, userContext);
    this.trackUserBehavior(userContext, 'query');
  }

  recordResult(queryId: string, results: SearchResult[]): void {
    // Record result quality metrics
    this.recordHistogram('rag_results_count', results.length);

    if (results.length > 0) {
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      this.recordHistogram('rag_avg_relevance_score', avgScore);
    }

    // Track result diversity
    this.analyzeResultDiversity(results);
  }

  private analyzeQueryComplexity(query: string, userContext: UserContext): void {
    const complexity = this.calculateQueryComplexity(query);
    this.recordHistogram('rag_query_complexity', complexity, {
      tenant: userContext.tenantId
    });
  }

  private calculateQueryComplexity(query: string): number {
    // Simple complexity metric based on query characteristics
    const wordCount = query.split(/\s+/).length;
    const hasQuestions = /\?/.test(query);
    const hasOperators = /\b(AND|OR|NOT)\b/i.test(query);

    let complexity = wordCount;
    if (hasQuestions) complexity += 2;
    if (hasOperators) complexity += 3;

    return Math.min(complexity, 10); // Cap at 10
  }
}
```

## Configuration and Deployment Extensions

### Environment-Specific Configurations

**Configuration Extension System**:
```typescript
export interface ConfigurationProvider {
  // Configuration retrieval
  getConfig<T>(key: string, defaultValue?: T): Promise<T>;
  setConfig<T>(key: string, value: T): Promise<void>;

  // Configuration watching
  watchConfig(key: string, callback: ConfigChangeCallback): void;

  // Validation
  validateConfig(schema: ConfigSchema): Promise<ValidationResult>;

  // Provider info
  getProviderInfo(): ConfigProviderInfo;
}

interface ConfigChangeCallback {
  (key: string, oldValue: any, newValue: any): void;
}
```

**Kubernetes ConfigMap Provider**:
```typescript
export class KubernetesConfigProvider implements ConfigurationProvider {
  private k8sApi: CoreV1Api;
  private namespace: string;
  private configMapName: string;

  constructor(config: KubernetesConfig) {
    this.k8sApi = config.k8sApi;
    this.namespace = config.namespace;
    this.configMapName = config.configMapName;
  }

  async getConfig<T>(key: string, defaultValue?: T): Promise<T> {
    try {
      const configMap = await this.k8sApi.readNamespacedConfigMap(
        this.configMapName,
        this.namespace
      );

      const value = configMap.body.data?.[key];
      if (value === undefined) {
        return defaultValue as T;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Configuration key not found: ${key}`);
    }
  }

  async setConfig<T>(key: string, value: T): Promise<void> {
    const configMap = await this.k8sApi.readNamespacedConfigMap(
      this.configMapName,
      this.namespace
    );

    configMap.body.data = configMap.body.data || {};
    configMap.body.data[key] = JSON.stringify(value);

    await this.k8sApi.replaceNamespacedConfigMap(
      this.configMapName,
      this.namespace,
      configMap.body
    );
  }
}
```

## Extension Development Guidelines

### Development Best Practices

**Extension Development Process**:
```typescript
interface ExtensionDevelopmentGuidelines {
  // Planning phase
  planning: {
    requirements: "Define clear functional requirements";
    interface: "Design interface contracts first";
    compatibility: "Ensure backward compatibility";
    security: "Consider security implications";
  };

  // Implementation phase
  implementation: {
    separation: "Keep extension code separate from core";
    testing: "Comprehensive unit and integration tests";
    documentation: "Document interface and usage";
    errorHandling: "Robust error handling and recovery";
  };

  // Deployment phase
  deployment: {
    packaging: "Package extensions as separate modules";
    configuration: "Configuration-driven activation";
    monitoring: "Extension-specific monitoring";
    rollback: "Safe rollback mechanisms";
  };

  // Maintenance phase
  maintenance: {
    versioning: "Semantic versioning for extensions";
    updates: "Safe update mechanisms";
    deprecation: "Graceful deprecation process";
    support: "Long-term support commitments";
  };
}
```

### Testing Extensions

**Extension Testing Strategy**:
```typescript
interface ExtensionTesting {
  // Unit testing
  unitTesting: {
    isolation: "Test extensions in isolation";
    mocking: "Mock core system dependencies";
    coverage: "Achieve high test coverage";
    performance: "Performance testing for extensions";
  };

  // Integration testing
  integrationTesting: {
    coreIntegration: "Test integration with core system";
    endToEnd: "End-to-end workflow testing";
    compatibility: "Test with different core versions";
    failover: "Test extension failure scenarios";
  };

  // Load testing
  loadTesting: {
    performance: "Performance under load";
    scalability: "Scaling characteristics";
    resourceUsage: "Resource usage patterns";
    limits: "Determine performance limits";
  };
}
```

### Extension Security

**Security Considerations**:
```typescript
interface ExtensionSecurity {
  // Input validation
  inputValidation: {
    sanitization: "Sanitize all external inputs";
    validation: "Validate against expected schemas";
    injection: "Prevent injection attacks";
    limits: "Enforce input size limits";
  };

  // Access control
  accessControl: {
    permissions: "Minimal required permissions";
    isolation: "Process and data isolation";
    audit: "Audit extension activities";
    revocation: "Permission revocation mechanisms";
  };

  // Data protection
  dataProtection: {
    encryption: "Encrypt sensitive data";
    retention: "Data retention policies";
    deletion: "Secure data deletion";
    privacy: "Privacy protection mechanisms";
  };
}
```

---

This completes the comprehensive architectural documentation for cw-rag-core, covering all aspects from high-level system design to detailed implementation patterns and extension points.