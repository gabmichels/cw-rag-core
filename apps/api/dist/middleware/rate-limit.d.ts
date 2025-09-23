import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    /** Requests per minute per IP */
    perIp: number;
    /** Requests per minute per user */
    perUser: number;
    /** Requests per minute per tenant */
    perTenant: number;
    /** Time window in minutes */
    windowMinutes: number;
}
/**
 * Default rate limiting configuration
 */
export declare const DEFAULT_RATE_LIMITS: RateLimitConfig;
/**
 * Enhanced rate limiting for /ask endpoint
 */
export declare class AskRateLimiter {
    private config;
    private ipLimiter;
    private userLimiter;
    private tenantLimiter;
    constructor(config?: RateLimitConfig);
    /**
     * Check if request should be rate limited
     */
    checkRateLimit(request: FastifyRequest): {
        allowed: boolean;
        limitType?: 'ip' | 'user' | 'tenant';
        retryAfter?: number;
    };
    /**
     * Record a successful request
     */
    recordRequest(request: FastifyRequest): void;
    private checkLimit;
    private recordLimitUsage;
    private cleanupExpiredEntries;
}
/**
 * Rate limiting middleware for /ask endpoint
 */
export declare function createAskRateLimitMiddleware(fastify: FastifyInstance, config?: RateLimitConfig): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
