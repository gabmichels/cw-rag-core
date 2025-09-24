/**
 * Monitoring and observability features for embedding services
 * Provides metrics collection, health monitoring, and performance tracking
 */

import { EmbeddingServiceConfig, EmbeddingServiceCapabilities } from './embedding-config.js';
import { ChunkingResult } from './adaptive-chunker.js';
import { TokenCountResult } from './token-counter.js';

export interface EmbeddingMetrics {
  // Request metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;

  // Token metrics
  totalTokensProcessed: number;
  averageTokensPerRequest: number;
  maxTokensInSingleRequest: number;

  // Chunking metrics
  totalChunksGenerated: number;
  averageChunksPerDocument: number;
  chunkSizeDistribution: {
    under200: number;
    between200And400: number;
    between400And500: number;
    over500: number;
  };

  // Performance metrics
  averageResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;

  // Error metrics
  errorsByType: Record<string, number>;
  retryAttempts: number;
  fallbackUsage: number;

  // Service health
  lastHealthCheck: string;
  serviceAvailability: number; // percentage

  // Configuration tracking
  configurationChanges: number;
  currentConfiguration: string; // config hash
}

export interface PerformanceSnapshot {
  timestamp: string;
  requestId: string;
  operation: 'embed' | 'embedBatch' | 'embedWithChunking';
  duration: number;
  tokenCount: number;
  chunkCount?: number;
  success: boolean;
  errorType?: string;
  configurationUsed: string;
}

export interface HealthCheckResult {
  timestamp: string;
  healthy: boolean;
  responseTime: number;
  capabilities?: EmbeddingServiceCapabilities;
  version?: string;
  error?: string;
}

/**
 * Metrics collector and aggregator
 */
export class EmbeddingMetricsCollector {
  private metrics: EmbeddingMetrics;
  private performanceHistory: PerformanceSnapshot[] = [];
  private healthHistory: HealthCheckResult[] = [];
  private maxHistorySize = 1000;
  private responseTimes: number[] = [];

  constructor() {
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): EmbeddingMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokensProcessed: 0,
      averageTokensPerRequest: 0,
      maxTokensInSingleRequest: 0,
      totalChunksGenerated: 0,
      averageChunksPerDocument: 0,
      chunkSizeDistribution: {
        under200: 0,
        between200And400: 0,
        between400And500: 0,
        over500: 0
      },
      averageResponseTimeMs: 0,
      p95ResponseTimeMs: 0,
      p99ResponseTimeMs: 0,
      errorsByType: {},
      retryAttempts: 0,
      fallbackUsage: 0,
      lastHealthCheck: new Date().toISOString(),
      serviceAvailability: 100,
      configurationChanges: 0,
      currentConfiguration: 'default'
    };
  }

  /**
   * Record a performance snapshot
   */
  recordPerformance(snapshot: PerformanceSnapshot): void {
    // Add to history
    this.performanceHistory.push(snapshot);
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }

    // Update metrics
    this.metrics.totalRequests++;
    if (snapshot.success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (snapshot.errorType) {
        this.metrics.errorsByType[snapshot.errorType] =
          (this.metrics.errorsByType[snapshot.errorType] || 0) + 1;
      }
    }

    // Update token metrics
    this.metrics.totalTokensProcessed += snapshot.tokenCount;
    this.metrics.averageTokensPerRequest =
      this.metrics.totalTokensProcessed / this.metrics.totalRequests;
    this.metrics.maxTokensInSingleRequest =
      Math.max(this.metrics.maxTokensInSingleRequest, snapshot.tokenCount);

    // Update chunk metrics
    if (snapshot.chunkCount) {
      this.metrics.totalChunksGenerated += snapshot.chunkCount;
      this.metrics.averageChunksPerDocument =
        this.metrics.totalChunksGenerated / this.metrics.totalRequests;
    }

    // Update response times
    this.responseTimes.push(snapshot.duration);
    if (this.responseTimes.length > this.maxHistorySize) {
      this.responseTimes.shift();
    }
    this.updateResponseTimeMetrics();

    console.log('StructuredLog:PerformanceRecorded', {
      operation: snapshot.operation,
      duration: snapshot.duration,
      success: snapshot.success,
      tokenCount: snapshot.tokenCount,
      chunkCount: snapshot.chunkCount,
      timestamp: snapshot.timestamp
    });
  }

  /**
   * Record chunking metrics
   */
  recordChunking(result: ChunkingResult): void {
    for (const chunk of result.chunks) {
      const tokenCount = chunk.tokenCount;

      if (tokenCount < 200) {
        this.metrics.chunkSizeDistribution.under200++;
      } else if (tokenCount < 400) {
        this.metrics.chunkSizeDistribution.between200And400++;
      } else if (tokenCount < 500) {
        this.metrics.chunkSizeDistribution.between400And500++;
      } else {
        this.metrics.chunkSizeDistribution.over500++;
      }
    }

    console.log('StructuredLog:ChunkingMetrics', {
      strategy: result.strategy,
      chunksGenerated: result.chunks.length,
      totalTokens: result.totalTokens,
      averageTokensPerChunk: result.totalTokens / result.chunks.length,
      warnings: result.warnings.length
    });
  }

  /**
   * Record health check result
   */
  recordHealthCheck(result: HealthCheckResult): void {
    this.healthHistory.push(result);
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }

    this.metrics.lastHealthCheck = result.timestamp;

    // Calculate service availability (last 100 checks)
    const recentChecks = this.healthHistory.slice(-100);
    const healthyChecks = recentChecks.filter(check => check.healthy).length;
    this.metrics.serviceAvailability = (healthyChecks / recentChecks.length) * 100;

    console.log('StructuredLog:HealthCheckRecorded', {
      healthy: result.healthy,
      responseTime: result.responseTime,
      availability: this.metrics.serviceAvailability,
      error: result.error
    });
  }

  /**
   * Record retry attempt
   */
  recordRetry(reason: string): void {
    this.metrics.retryAttempts++;
    console.log('StructuredLog:RetryAttempt', {
      reason,
      totalRetries: this.metrics.retryAttempts
    });
  }

  /**
   * Record fallback usage
   */
  recordFallback(reason: string): void {
    this.metrics.fallbackUsage++;
    console.log('StructuredLog:FallbackUsed', {
      reason,
      totalFallbacks: this.metrics.fallbackUsage
    });
  }

  /**
   * Record configuration change
   */
  recordConfigurationChange(oldConfig: EmbeddingServiceConfig, newConfig: EmbeddingServiceConfig): void {
    this.metrics.configurationChanges++;
    this.metrics.currentConfiguration = this.hashConfig(newConfig);

    console.log('StructuredLog:ConfigurationChanged', {
      changeNumber: this.metrics.configurationChanges,
      oldProvider: oldConfig.provider,
      newProvider: newConfig.provider,
      oldModel: oldConfig.model,
      newModel: newConfig.model,
      configHash: this.metrics.currentConfiguration
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): EmbeddingMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(minutes: number = 60): {
    avgResponseTime: number;
    successRate: number;
    errorRate: number;
    tokensPerMinute: number;
  } {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentSnapshots = this.performanceHistory.filter(
      snapshot => new Date(snapshot.timestamp) > cutoff
    );

    if (recentSnapshots.length === 0) {
      return { avgResponseTime: 0, successRate: 100, errorRate: 0, tokensPerMinute: 0 };
    }

    const totalDuration = recentSnapshots.reduce((sum, s) => sum + s.duration, 0);
    const successCount = recentSnapshots.filter(s => s.success).length;
    const totalTokens = recentSnapshots.reduce((sum, s) => sum + s.tokenCount, 0);

    return {
      avgResponseTime: totalDuration / recentSnapshots.length,
      successRate: (successCount / recentSnapshots.length) * 100,
      errorRate: ((recentSnapshots.length - successCount) / recentSnapshots.length) * 100,
      tokensPerMinute: totalTokens / minutes
    };
  }

  /**
   * Get alertable conditions
   */
  getAlerts(): Array<{ severity: 'warning' | 'error'; message: string }> {
    const alerts: Array<{ severity: 'warning' | 'error'; message: string }> = [];
    const trends = this.getPerformanceTrends(30); // Last 30 minutes

    // High error rate
    if (trends.errorRate > 10) {
      alerts.push({
        severity: 'error',
        message: `High error rate: ${trends.errorRate.toFixed(1)}%`
      });
    } else if (trends.errorRate > 5) {
      alerts.push({
        severity: 'warning',
        message: `Elevated error rate: ${trends.errorRate.toFixed(1)}%`
      });
    }

    // Slow response times
    if (trends.avgResponseTime > 10000) {
      alerts.push({
        severity: 'error',
        message: `Very slow response times: ${(trends.avgResponseTime / 1000).toFixed(1)}s average`
      });
    } else if (trends.avgResponseTime > 5000) {
      alerts.push({
        severity: 'warning',
        message: `Slow response times: ${(trends.avgResponseTime / 1000).toFixed(1)}s average`
      });
    }

    // Low service availability
    if (this.metrics.serviceAvailability < 95) {
      alerts.push({
        severity: 'error',
        message: `Low service availability: ${this.metrics.serviceAvailability.toFixed(1)}%`
      });
    } else if (this.metrics.serviceAvailability < 99) {
      alerts.push({
        severity: 'warning',
        message: `Service availability below target: ${this.metrics.serviceAvailability.toFixed(1)}%`
      });
    }

    // Too many large chunks
    const totalChunks = Object.values(this.metrics.chunkSizeDistribution).reduce((a, b) => a + b, 0);
    if (totalChunks > 0) {
      const largeChunkPercentage = (this.metrics.chunkSizeDistribution.over500 / totalChunks) * 100;
      if (largeChunkPercentage > 10) {
        alerts.push({
          severity: 'warning',
          message: `High percentage of oversized chunks: ${largeChunkPercentage.toFixed(1)}%`
        });
      }
    }

    return alerts;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    lines.push('# HELP embedding_requests_total Total number of embedding requests');
    lines.push('# TYPE embedding_requests_total counter');
    lines.push(`embedding_requests_total{status="success"} ${this.metrics.successfulRequests}`);
    lines.push(`embedding_requests_total{status="error"} ${this.metrics.failedRequests}`);

    lines.push('# HELP embedding_tokens_processed_total Total number of tokens processed');
    lines.push('# TYPE embedding_tokens_processed_total counter');
    lines.push(`embedding_tokens_processed_total ${this.metrics.totalTokensProcessed}`);

    lines.push('# HELP embedding_response_time_ms Response time in milliseconds');
    lines.push('# TYPE embedding_response_time_ms histogram');
    lines.push(`embedding_response_time_ms_avg ${this.metrics.averageResponseTimeMs}`);
    lines.push(`embedding_response_time_ms_p95 ${this.metrics.p95ResponseTimeMs}`);
    lines.push(`embedding_response_time_ms_p99 ${this.metrics.p99ResponseTimeMs}`);

    lines.push('# HELP embedding_service_availability Service availability percentage');
    lines.push('# TYPE embedding_service_availability gauge');
    lines.push(`embedding_service_availability ${this.metrics.serviceAvailability / 100}`);

    return lines.join('\n');
  }

  private updateResponseTimeMetrics(): void {
    if (this.responseTimes.length === 0) return;

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    this.metrics.averageResponseTimeMs =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    this.metrics.p95ResponseTimeMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.p99ResponseTimeMs = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  private hashConfig(config: EmbeddingServiceConfig): string {
    const configStr = JSON.stringify({
      provider: config.provider,
      model: config.model,
      maxTokens: config.capabilities.maxTokens,
      strategy: config.chunking.strategy
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.performanceHistory = [];
    this.healthHistory = [];
    this.responseTimes = [];
    console.log('StructuredLog:MetricsReset', { timestamp: new Date().toISOString() });
  }
}

/**
 * Global metrics collector instance
 */
let globalMetricsCollector: EmbeddingMetricsCollector | null = null;

/**
 * Get or create global metrics collector
 */
export function getGlobalMetricsCollector(): EmbeddingMetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new EmbeddingMetricsCollector();
  }
  return globalMetricsCollector;
}

/**
 * Reset global metrics collector (useful for testing)
 */
export function resetGlobalMetricsCollector(): void {
  globalMetricsCollector = null;
}

/**
 * Middleware for automatic performance tracking
 */
export function createPerformanceTracker(collector: EmbeddingMetricsCollector) {
  return {
    async trackOperation<T>(
      operation: 'embed' | 'embedBatch' | 'embedWithChunking',
      tokenCount: number,
      configHash: string,
      fn: () => Promise<T>
    ): Promise<T> {
      const startTime = performance.now();
      const requestId = Math.random().toString(36).substring(7);

      try {
        const result = await fn();
        const duration = performance.now() - startTime;

        collector.recordPerformance({
          timestamp: new Date().toISOString(),
          requestId,
          operation,
          duration,
          tokenCount,
          success: true,
          configurationUsed: configHash
        });

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;

        collector.recordPerformance({
          timestamp: new Date().toISOString(),
          requestId,
          operation,
          duration,
          tokenCount,
          success: false,
          errorType: (error as Error).constructor.name,
          configurationUsed: configHash
        });

        throw error;
      }
    }
  };
}