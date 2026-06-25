import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory rate limiter (no external dependency).
 *
 * Suitable for a single-instance deployment. For multi-instance / serverless
 * setups, swap the store for Redis. Buckets are keyed by client IP + a label
 * so different routes can have independent limits.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  label: string;
  message?: string;
}) {
  const { windowMs, max, label, message } = options;
  const buckets = new Map<string, Bucket>();

  // Periodically evict stale buckets to bound memory usage.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  // Don't keep the event loop alive just for the sweeper.
  if (typeof sweep.unref === 'function') sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${label}:${ip}`;
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || 'Too many requests. Please try again later.',
      });
    }

    return next();
  };
}
