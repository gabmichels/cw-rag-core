import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';

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
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  perIp: parseInt(process.env.RATE_LIMIT_PER_IP || '30'),
  perUser: parseInt(process.env.RATE_LIMIT_PER_USER || '100'),
  perTenant: parseInt(process.env.RATE_LIMIT_PER_TENANT || '1000'),
  windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '1')
};

/**
 * Enhanced rate limiting for /ask endpoint
 */
export class AskRateLimiter {
  private ipLimiter: Map<string, { count: number; resetTime: number }> = new Map();
  private userLimiter: Map<string, { count: number; resetTime: number }> = new Map();
  private tenantLimiter: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(private config: RateLimitConfig = DEFAULT_RATE_LIMITS) {}

  /**
   * Check if request should be rate limited
   */
  checkRateLimit(request: FastifyRequest): {
    allowed: boolean;
    limitType?: 'ip' | 'user' | 'tenant';
    retryAfter?: number;
  } {
    const body = request.body as any;
    const ip = (request as any).ip;
    const userId = body?.userContext?.id;
    const tenantId = body?.userContext?.tenantId;

    const now = Date.now();
    const windowMs = this.config.windowMinutes * 60 * 1000;

    // Check IP rate limit
    if (ip) {
      const ipLimit = this.checkLimit(this.ipLimiter, ip, this.config.perIp, now, windowMs);
      if (!ipLimit.allowed) {
        return { allowed: false, limitType: 'ip', retryAfter: ipLimit.retryAfter };
      }
    }

    // Check user rate limit
    if (userId) {
      const userKey = `${tenantId}:${userId}`;
      const userLimit = this.checkLimit(this.userLimiter, userKey, this.config.perUser, now, windowMs);
      if (!userLimit.allowed) {
        return { allowed: false, limitType: 'user', retryAfter: userLimit.retryAfter };
      }
    }

    // Check tenant rate limit
    if (tenantId) {
      const tenantLimit = this.checkLimit(this.tenantLimiter, tenantId, this.config.perTenant, now, windowMs);
      if (!tenantLimit.allowed) {
        return { allowed: false, limitType: 'tenant', retryAfter: tenantLimit.retryAfter };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a successful request
   */
  recordRequest(request: FastifyRequest): void {
    const body = request.body as any;
    const ip = (request as any).ip;
    const userId = body?.userContext?.id;
    const tenantId = body?.userContext?.tenantId;

    const now = Date.now();
    const windowMs = this.config.windowMinutes * 60 * 1000;

    // Record IP request
    if (ip) {
      this.recordLimitUsage(this.ipLimiter, ip, now, windowMs);
    }

    // Record user request
    if (userId) {
      const userKey = `${tenantId}:${userId}`;
      this.recordLimitUsage(this.userLimiter, userKey, now, windowMs);
    }

    // Record tenant request
    if (tenantId) {
      this.recordLimitUsage(this.tenantLimiter, tenantId, now, windowMs);
    }
  }

  private checkLimit(
    limiter: Map<string, { count: number; resetTime: number }>,
    key: string,
    limit: number,
    now: number,
    windowMs: number
  ): { allowed: boolean; retryAfter?: number } {
    const entry = limiter.get(key);

    if (!entry || now >= entry.resetTime) {
      // Window has expired or no entry exists
      return { allowed: true };
    }

    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  private recordLimitUsage(
    limiter: Map<string, { count: number; resetTime: number }>,
    key: string,
    now: number,
    windowMs: number
  ): void {
    const entry = limiter.get(key);

    if (!entry || now >= entry.resetTime) {
      // Create new entry for new window
      limiter.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
    } else {
      // Increment existing entry
      entry.count++;
    }

    // Clean up expired entries periodically
    if (Math.random() < 0.01) { // 1% chance
      this.cleanupExpiredEntries(limiter, now);
    }
  }

  private cleanupExpiredEntries(
    limiter: Map<string, { count: number; resetTime: number }>,
    now: number
  ): void {
    for (const [key, entry] of limiter.entries()) {
      if (now >= entry.resetTime) {
        limiter.delete(key);
      }
    }
  }
}

/**
 * Rate limiting middleware for /ask endpoint
 */
export function createAskRateLimitMiddleware(
  fastify: FastifyInstance,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS
) {
  const rateLimiter = new AskRateLimiter(config);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const limitCheck = rateLimiter.checkRateLimit(request);

    if (!limitCheck.allowed) {
      const body = request.body as any;
      const tenantId = body?.userContext?.tenantId || 'unknown';
      const userId = body?.userContext?.id || 'unknown';

      // Log rate limit violation
      fastify.log.warn({
        event: 'rate_limit_exceeded',
        type: 'ask_endpoint',
        limitType: limitCheck.limitType,
        ip: (request as any).ip,
        userId,
        tenantId,
        retryAfter: limitCheck.retryAfter,
        timestamp: new Date().toISOString()
      }, `/ask rate limit exceeded for ${limitCheck.limitType}`);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', config.perIp.toString());
      reply.header('X-RateLimit-Remaining', '0');
      reply.header('X-RateLimit-Reset', new Date(Date.now() + (limitCheck.retryAfter || 60) * 1000).toISOString());
      reply.header('Retry-After', (limitCheck.retryAfter || 60).toString());

      return reply.status(429).send({
        error: 'Rate Limit Exceeded',
        message: `Too many requests from ${limitCheck.limitType}. Please try again later.`,
        retryAfter: limitCheck.retryAfter || 60,
        code: 'ASK_RATE_LIMIT_EXCEEDED'
      });
    }

    // Record the request
    rateLimiter.recordRequest(request);
  };
}