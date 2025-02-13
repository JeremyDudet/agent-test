import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { AppError } from '../error/errorHandler';

const WINDOW_SIZE_IN_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 100;

export class RateLimiter {
  private redis: Redis;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl);
  }

  middleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id || req.ip;
      const key = `rate_limit:${userId}`;
      
      const currentTime = Math.floor(Date.now() / 1000);
      const windowStart = currentTime - WINDOW_SIZE_IN_SECONDS;

      // Remove old requests
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Count requests in current window
      const requestCount = await this.redis.zcard(key);

      if (requestCount >= MAX_REQUESTS_PER_WINDOW) {
        throw new AppError(
          'Too many requests',
          429,
          'RATE_LIMIT_EXCEEDED'
        );
      }

      // Add current request
      await this.redis.zadd(key, currentTime, `${currentTime}-${Math.random()}`);
      
      // Set expiry on the key
      await this.redis.expire(key, WINDOW_SIZE_IN_SECONDS * 2);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW);
      res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS_PER_WINDOW - requestCount - 1);
      res.setHeader('X-RateLimit-Reset', currentTime + WINDOW_SIZE_IN_SECONDS);

      next();
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          error: {
            message: error.message,
            code: error.code
          }
        });
        return;
      }
      next(error);
    }
  };

  async close(): Promise<void> {
    await this.redis.quit();
  }
} 