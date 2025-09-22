import {
  AskRequest,
  AskResponse,
  UserContext
} from '@cw-rag-core/shared';

export interface APIClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  apiKey?: string;
}

export interface APICallMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  statusCode?: number;
  error?: string;
  retryCount: number;
}

export class EvaluationAPIClient {
  private config: APIClientConfig;
  private metrics: APICallMetrics[] = [];

  constructor(config: APIClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config
    };
  }

  async ask(request: AskRequest): Promise<{ response: AskResponse; metrics: APICallMetrics }> {
    const startTime = performance.now();
    let lastError: Error | null = null;
    let retryCount = 0;
    let statusCode: number | undefined;

    for (let attempt = 0; attempt <= (this.config.retries || 3); attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${this.config.baseUrl}/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
          },
          body: JSON.stringify(request),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        statusCode = response.status;

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const responseData = await response.json() as AskResponse;
        const endTime = performance.now();

        const metrics: APICallMetrics = {
          startTime,
          endTime,
          duration: endTime - startTime,
          statusCode,
          retryCount: attempt
        };

        this.metrics.push(metrics);
        return { response: responseData, metrics };

      } catch (error) {
        lastError = error as Error;
        retryCount = attempt;

        if (attempt < (this.config.retries || 3)) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const endTime = performance.now();
    const failureMetrics: APICallMetrics = {
      startTime,
      endTime,
      duration: endTime - startTime,
      statusCode,
      error: lastError?.message,
      retryCount
    };

    this.metrics.push(failureMetrics);
    throw lastError || new Error('Unknown API error');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.baseUrl}/healthz`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async waitForReady(maxWaitTime: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitTime) {
      if (await this.healthCheck()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  getMetrics(): APICallMetrics[] {
    return [...this.metrics];
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  getPerformanceStats(): {
    totalCalls: number;
    averageDuration: number;
    successRate: number;
    retryRate: number;
    p95Duration: number;
    p99Duration: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalCalls: 0,
        averageDuration: 0,
        successRate: 0,
        retryRate: 0,
        p95Duration: 0,
        p99Duration: 0
      };
    }

    const successfulCalls = this.metrics.filter(m => !m.error);
    const durations = this.metrics.map(m => m.duration).sort((a, b) => a - b);
    const retriedCalls = this.metrics.filter(m => m.retryCount > 0);

    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      totalCalls: this.metrics.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      successRate: successfulCalls.length / this.metrics.length,
      retryRate: retriedCalls.length / this.metrics.length,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0
    };
  }
}

// Helper function to create user context for different test scenarios
export function createTestUserContext(
  scenario: 'standard' | 'rbac_limited' | 'rbac_admin' | 'unauthorized',
  tenantId: string = 'test-tenant'
): UserContext {
  const baseContext: UserContext = {
    tenantId,
    id: `test-user-${Date.now()}`,
    groupIds: []
  };

  switch (scenario) {
    case 'standard':
      return {
        ...baseContext,
        groupIds: ['users', 'readers']
      };

    case 'rbac_limited':
      return {
        ...baseContext,
        groupIds: ['restricted-users']
      };

    case 'rbac_admin':
      return {
        ...baseContext,
        id: 'admin-user',
        groupIds: ['admins', 'users', 'readers']
      };

    case 'unauthorized':
      return {
        ...baseContext,
        groupIds: []
      };

    default:
      return baseContext;
  }
}

// Helper function to create ask requests for different evaluation scenarios
export function createAskRequest(
  query: string,
  userContext: UserContext,
  options: {
    k?: number;
    filter?: Record<string, any>;
    includeRawChunks?: boolean;
  } = {}
): AskRequest {
  return {
    query,
    userContext,
    k: options.k || 5,
    ...(options.filter && { filter: options.filter }),
    ...(options.includeRawChunks !== undefined && { includeRawChunks: options.includeRawChunks })
  };
}