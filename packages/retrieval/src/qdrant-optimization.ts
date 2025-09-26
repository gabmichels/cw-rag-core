/**
 * Qdrant performance optimization configurations and utilities
 */

export interface QdrantOptimizationConfig {
  // HNSW index parameters
  hnsw: {
    m: number;              // Number of bi-directional links (4-100, default 16)
    ef_construct: number;   // Size of the dynamic candidate list (100-1000, default 100)
    ef: number;            // Size of the candidate list during search (10-1000, default 100)
    max_indexing_threads?: number; // Number of threads for indexing (default: number of CPU cores)
  };

  // Search optimization
  search: {
    default_ef: number;     // Default ef parameter for search
    adaptive_ef: boolean;   // Whether to adapt ef based on query complexity
    min_ef: number;         // Minimum ef value
    max_ef: number;         // Maximum ef value
  };

  // Collection configuration
  collection: {
    vectors: {
      size: number;
      distance: 'Cosine' | 'Euclid' | 'Dot';
      on_disk?: boolean;    // Store vectors on disk for memory efficiency
    };
    optimizers_config?: {
      deleted_threshold?: number;     // Threshold for cleanup (0.2)
      vacuum_min_vector_number?: number; // Minimum vectors before vacuum (1000)
      default_segment_number?: number;    // Number of segments (2)
      max_segment_size?: number;          // Max segment size in KB (200000)
      memmap_threshold?: number;          // Memory map threshold in KB (50000)
      indexing_threshold?: number;        // Indexing threshold (20000)
      flush_interval_sec?: number;        // Flush interval (5)
    };
    quantization_config?: {
      scalar: {
        type: 'int8';
        quantile?: number;  // Quantile for quantization (0.99)
        always_ram?: boolean; // Keep quantized vectors in RAM
      };
    };
  };

  // Payload indexing
  payload_indexes: Array<{
    field_name: string;
    field_schema: 'keyword' | 'integer' | 'float' | 'bool' | 'text';
    options?: {
      on_disk?: boolean;
      is_tenant?: boolean;  // For multi-tenant filtering
    };
  }>;

  // Caching configuration
  caching: {
    query_cache_enabled: boolean;
    query_cache_ttl_ms: number;
    vector_cache_enabled: boolean;
    vector_cache_size_mb: number;
  };
}

export const OPTIMIZED_QDRANT_CONFIG: QdrantOptimizationConfig = {
  hnsw: {
    m: 32,                    // Balanced connectivity
    ef_construct: 200,        // Good recall during indexing
    ef: 128,                  // Good search performance
    max_indexing_threads: 4   // Conservative threading
  },

  search: {
    default_ef: 128,
    adaptive_ef: true,
    min_ef: 64,
    max_ef: 512
  },

  collection: {
    vectors: {
      size: 384,              // BGE-small-en-v1.5
      distance: 'Cosine',
      on_disk: false          // Keep in memory for speed
    },
    optimizers_config: {
      deleted_threshold: 0.2,
      vacuum_min_vector_number: 1000,
      default_segment_number: 2,
      max_segment_size: 200000,
      memmap_threshold: 50000,
      indexing_threshold: 20000,
      flush_interval_sec: 5
    },
    quantization_config: {
      scalar: {
        type: 'int8',
        quantile: 0.99,
        always_ram: true
      }
    }
  },

  payload_indexes: [
    // Core RBAC indexes
    { field_name: 'tenant', field_schema: 'keyword', options: { is_tenant: true } },
    { field_name: 'docId', field_schema: 'keyword' },
    { field_name: 'acl', field_schema: 'keyword' },

    // Language and temporal
    { field_name: 'lang', field_schema: 'keyword' },
    { field_name: 'createdAt', field_schema: 'keyword' },
    { field_name: 'modifiedAt', field_schema: 'keyword' },

    // Full-text search
    { field_name: 'content', field_schema: 'text' },

    // Performance indexes
    { field_name: 'url', field_schema: 'keyword' },
    { field_name: 'version', field_schema: 'keyword' },
    { field_name: 'spaceId', field_schema: 'keyword' },

    // Lexical features
    { field_name: 'lexicalCoreTokens', field_schema: 'keyword' },
    { field_name: 'lexicalPhrases', field_schema: 'keyword' },
    { field_name: 'lexicalLanguage', field_schema: 'keyword' }
  ],

  caching: {
    query_cache_enabled: true,
    query_cache_ttl_ms: 300000, // 5 minutes
    vector_cache_enabled: true,
    vector_cache_size_mb: 512
  }
};

/**
 * Adaptive EF parameter calculation based on query complexity
 */
export function calculateAdaptiveEf(
  query: string,
  baseEf: number = OPTIMIZED_QDRANT_CONFIG.search.default_ef,
  minEf: number = OPTIMIZED_QDRANT_CONFIG.search.min_ef,
  maxEf: number = OPTIMIZED_QDRANT_CONFIG.search.max_ef
): number {
  // Simple heuristic: longer queries might need more exploration
  const queryComplexity = Math.min(query.split(/\s+/).length / 10, 1);

  // Scale EF based on complexity
  const adaptiveEf = Math.round(baseEf * (1 + queryComplexity));

  return Math.max(minEf, Math.min(maxEf, adaptiveEf));
}

/**
 * Generate optimized collection configuration for Qdrant
 */
export function generateOptimizedCollectionConfig(
  vectorSize: number = 384,
  distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
): any {
  const config = OPTIMIZED_QDRANT_CONFIG;

  return {
    vectors: {
      ...config.collection.vectors,
      size: vectorSize,
      distance
    },
    hnsw_config: config.hnsw,
    optimizers_config: config.collection.optimizers_config,
    quantization_config: config.collection.quantization_config,
    on_disk_payload: true, // Store payload on disk to save memory
    payload_schema: config.payload_indexes.reduce((schema, index) => {
      schema[index.field_name] = {
        type: index.field_schema,
        index: {
          type: 'keyword',
          on_disk: index.options?.on_disk ?? true
        }
      };
      return schema;
    }, {} as any)
  };
}

/**
 * Performance monitoring utilities
 */
export class QdrantPerformanceMonitor {
  private static metrics = new Map<string, {
    searchCount: number;
    avgSearchTime: number;
    cacheHitRate: number;
    lastUpdated: number;
  }>();

  static recordSearch(operation: string, duration: number, cacheHit: boolean = false): void {
    const existing = this.metrics.get(operation) || {
      searchCount: 0,
      avgSearchTime: 0,
      cacheHitRate: 0,
      lastUpdated: Date.now()
    };

    const newCount = existing.searchCount + 1;
    const newAvgTime = (existing.avgSearchTime * existing.searchCount + duration) / newCount;
    const newCacheHitRate = cacheHit ?
      ((existing.cacheHitRate * existing.searchCount) + 1) / newCount :
      (existing.cacheHitRate * existing.searchCount) / newCount;

    this.metrics.set(operation, {
      searchCount: newCount,
      avgSearchTime: newAvgTime,
      cacheHitRate: newCacheHitRate,
      lastUpdated: Date.now()
    });
  }

  static getMetrics(operation: string): any {
    return this.metrics.get(operation) || null;
  }

  static getAllMetrics(): any {
    return Object.fromEntries(this.metrics);
  }

  static reset(): void {
    this.metrics.clear();
  }
}

/**
 * Query result caching
 */
export class QueryResultCache {
  private cache = new Map<string, {
    results: any[];
    timestamp: number;
    ttl: number;
  }>();

  constructor(
    private maxSize: number = 1000,
    private defaultTtl: number = OPTIMIZED_QDRANT_CONFIG.caching.query_cache_ttl_ms
  ) {}

  private generateKey(query: string, filters: any, limit: number): string {
    return JSON.stringify({ query, filters, limit });
  }

  get(query: string, filters: any, limit: number): any[] | null {
    const key = this.generateKey(query, filters, limit);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      QdrantPerformanceMonitor.recordSearch('cache_hit', 0, true);
      return cached.results;
    }

    if (cached) {
      this.cache.delete(key); // Expired, remove it
    }

    return null;
  }

  set(query: string, filters: any, limit: number, results: any[], ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      // Simple LRU: remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.generateKey(query, filters, limit);
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}