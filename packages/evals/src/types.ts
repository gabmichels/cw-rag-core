// Type definitions for evaluation harness
// These will import from @cw-rag-core/shared once packages are built
export type TenantId = string;
export type UserId = string;
export type GroupId = string;

// Base evaluation record types
export interface BaseEvalRecord {
  id: string;
  query: string;
  tenantId: TenantId;
}

// Gold standard dataset - ground truth Q&A pairs
export interface GoldEvalRecord extends BaseEvalRecord {
  answerspan: string;
  docId: string;
  context?: string; // Optional full context for validation
}

// Out-of-domain dataset - queries that should trigger "I don't know"
export interface OODEvalRecord extends BaseEvalRecord {
  expectedResponse: 'IDK' | 'NO_ANSWER';
  category: string; // e.g., "outside_domain", "no_relevant_docs", "ambiguous"
}

// Injection attack dataset - adversarial prompts
export interface InjectionEvalRecord extends BaseEvalRecord {
  injectionType: 'prompt_injection' | 'data_extraction' | 'system_override' | 'role_manipulation';
  maliciousPrompt: string;
  expectedBehavior: 'reject' | 'sanitize' | 'ignore';
}

// RBAC dataset - queries where user lacks permissions
export interface RBACEvalRecord extends BaseEvalRecord {
  userId: UserId;
  userGroups: GroupId[];
  requiredACL: string[];
  expectedDocIds: string[]; // Documents the user should NOT have access to
  allowedDocIds: string[]; // Documents the user should have access to
}

// Union type for all evaluation records
export type EvalRecord = GoldEvalRecord | OODEvalRecord | InjectionEvalRecord | RBACEvalRecord;

// Dataset types
export type DatasetType = 'gold' | 'ood' | 'inject' | 'rbac';

export interface Dataset<T extends EvalRecord = EvalRecord> {
  type: DatasetType;
  version: string;
  description: string;
  records: T[];
  metadata: {
    createdAt: string;
    totalRecords: number;
    source?: string;
  };
}

// Evaluation result types
export interface RetrievalResult {
  docId: string;
  score: number;
  content: string;
  rank: number;
}

export interface EvaluationResult {
  recordId: string;
  query: string;
  retrievedDocs: RetrievalResult[];
  actualResponse: string;
  passed: boolean;
  metrics: Record<string, number>;
  errors?: string[];
  timestamp: string;
}

// Metric computation types
export interface RecallAtK {
  k: number;
  recall: number;
  relevantFound: number;
  totalRelevant: number;
}

export interface MRRResult {
  mrr: number;
  reciprocalRanks: number[];
  queriesWithRelevant: number;
  totalQueries: number;
}

export interface IDKMetrics {
  precision: number;
  recall: number;
  f1Score: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
}

export interface InjectionMetrics {
  bypassRate: number;
  detectionRate: number;
  totalAttempts: number;
  successfulBypasses: number;
  detectedAttacks: number;
}

export interface RBACMetrics {
  leakRate: number;
  enforcementRate: number;
  totalQueries: number;
  unauthorizedAccess: number;
  properlyBlocked: number;
}

export interface AggregatedMetrics {
  gold?: {
    recallAt1: RecallAtK;
    recallAt3: RecallAtK;
    recallAt5: RecallAtK;
    mrr: MRRResult;
  };
  ood?: IDKMetrics;
  injection?: InjectionMetrics;
  rbac?: RBACMetrics;
  overall: {
    totalEvaluations: number;
    passRate: number;
    avgExecutionTime: number;
  };
}

// Configuration types
export interface EvaluationConfig {
  datasets: DatasetType[];
  retrievalConfig: {
    topK: number;
    hybridSearchWeights?: {
      bm25: number;
      semantic: number;
    };
    rerankerEnabled: boolean;
  };
  guardrailsConfig: {
    injectionDetectionEnabled: boolean;
    rbacEnforcementEnabled: boolean;
    idkThreshold: number;
  };
  outputConfig: {
    saveResults: boolean;
    outputDir: string;
    includeDetails: boolean;
  };
  apiConfig?: {
    baseUrl: string;
    timeout: number;
    retries: number;
  };
}

// CLI and runner types
export interface RunnerOptions {
  dataset: DatasetType | 'all';
  config?: string;
  output?: string;
  verbose?: boolean;
  parallel?: boolean;
  maxConcurrency?: number;
}

export interface EvaluationReport {
  config: EvaluationConfig;
  results: EvaluationResult[];
  metrics: AggregatedMetrics;
  summary: {
    startTime: string;
    endTime: string;
    duration: number;
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
  };
}