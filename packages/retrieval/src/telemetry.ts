/**
 * Telemetry and monitoring for retrieval system
 */

import { configManager } from './config-manager.js';

export interface TelemetryEvent {
  event: string;
  timestamp: string;
  tenantId?: string;
  userId?: string;
  queryId?: string;
  duration?: number;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface RetrievalMetrics {
  queryCount: number;
  avgResponseTime: number;
  successRate: number;
  featureUsage: Record<string, number>;
  errorCounts: Record<string, number>;
}

export class RetrievalTelemetry {
  private events: TelemetryEvent[] = [];
  private maxEvents = 10000;

  /**
   * Record a telemetry event
   */
  record(event: Omit<TelemetryEvent, 'timestamp'>): void {
    const telemetryEvent: TelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    this.events.push(telemetryEvent);

    // Maintain max events limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Telemetry:', telemetryEvent);
    }
  }

  /**
   * Record search performance
   */
  recordSearch(queryId: string, tenantId: string, duration: number, success: boolean, metadata?: any): void {
    this.record({
      event: 'search_completed',
      queryId,
      tenantId,
      duration,
      success,
      metadata: {
        ...metadata,
        config: configManager.exportForTelemetry()
      }
    });
  }

  /**
   * Record feature usage
   */
  recordFeatureUsage(feature: string, tenantId?: string, metadata?: any): void {
    this.record({
      event: 'feature_used',
      tenantId,
      success: true,
      metadata: {
        feature,
        ...metadata
      }
    });
  }

  /**
   * Record errors
   */
  recordError(error: Error, context: string, tenantId?: string, metadata?: any): void {
    this.record({
      event: 'error_occurred',
      tenantId,
      success: false,
      metadata: {
        error: error.message,
        stack: error.stack,
        context,
        ...metadata
      }
    });
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(timeRangeHours: number = 24): RetrievalMetrics {
    const cutoff = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => new Date(e.timestamp) > cutoff);

    const searchEvents = recentEvents.filter(e => e.event === 'search_completed');
    const featureEvents = recentEvents.filter(e => e.event === 'feature_used');
    const errorEvents = recentEvents.filter(e => e.event === 'error_occurred');

    const totalDuration = searchEvents.reduce((sum, e) => sum + (e.duration || 0), 0);
    const successfulSearches = searchEvents.filter(e => e.success).length;

    // Feature usage counts
    const featureUsage: Record<string, number> = {};
    featureEvents.forEach(e => {
      const feature = e.metadata?.feature;
      if (feature) {
        featureUsage[feature] = (featureUsage[feature] || 0) + 1;
      }
    });

    // Error counts
    const errorCounts: Record<string, number> = {};
    errorEvents.forEach(e => {
      const context = e.metadata?.context || 'unknown';
      errorCounts[context] = (errorCounts[context] || 0) + 1;
    });

    return {
      queryCount: searchEvents.length,
      avgResponseTime: searchEvents.length > 0 ? totalDuration / searchEvents.length : 0,
      successRate: searchEvents.length > 0 ? successfulSearches / searchEvents.length : 0,
      featureUsage,
      errorCounts
    };
  }

  /**
   * Export events for external analysis
   */
  exportEvents(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['event', 'timestamp', 'tenantId', 'userId', 'queryId', 'duration', 'success', 'metadata'];
      const rows = this.events.map(e => [
        e.event,
        e.timestamp,
        e.tenantId || '',
        e.userId || '',
        e.queryId || '',
        e.duration?.toString() || '',
        e.success.toString(),
        JSON.stringify(e.metadata || {})
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(this.events, null, 2);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get event count
   */
  size(): number {
    return this.events.length;
  }
}

// Global telemetry instance
export const telemetry = new RetrievalTelemetry();