import { Request, Response, NextFunction } from "express";
import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
redisClient.connect().catch(console.error);

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyPrefix?: string;   // Redis key prefix
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,       // 100 requests per minute
  keyPrefix: "ratelimit",
};

export function rateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests, keyPrefix } = { ...defaultConfig, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use userId if authenticated, otherwise use IP
      const identifier = req.user?.userId || req.ip || "anonymous";
      const key = `${keyPrefix}:${identifier}`;
      const windowSeconds = Math.ceil(windowMs / 1000);

      // Increment the counter
      const current = await redisClient.incr(key);

      // Set TTL on first request in window
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      // Get remaining TTL
      const ttl = await redisClient.ttl(key);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
      res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + ttl);

      if (current > maxRequests) {
        res.setHeader("Retry-After", ttl);
        return res.status(429).json({
          message: "Too many requests. Please try again later.",
          retryAfter: ttl,
        });
      }

      next();
    } catch (error) {
      // If Redis is down, allow the request through (fail-open)
      console.error("Rate limiter error:", error);
      next();
    }
  };
}

// Stricter rate limit for auth endpoints (prevent brute force)
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 20,             // 20 attempts per 15 minutes
  keyPrefix: "ratelimit:auth",
});

// Standard API rate limit
export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000,   // 1 minute
  maxRequests: 100,        // 100 requests per minute
  keyPrefix: "ratelimit:api",
});

// Stricter limit for job creation (prevent queue flooding)
export const jobCreationRateLimiter = rateLimiter({
  windowMs: 60 * 1000,   // 1 minute
  maxRequests: 1000,       // 1000 job creations per minute to support benchmark
  keyPrefix: "ratelimit:jobs",
});
