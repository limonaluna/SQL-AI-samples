import { Request, Response, NextFunction } from 'express';

/**
 * API Key Authentication Middleware
 * 
 * Validates requests using an API key from:
 * 1. x-api-key header
 * 2. Authorization: Bearer <token> header  
 * 3. apiKey query parameter (less secure, for testing only)
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  // Skip authentication for health check
  if (req.path === '/health') {
    return next();
  }

  const apiKey = process.env.API_KEY;
  
  // If no API key is configured, allow all requests (development mode)
  if (!apiKey) {
    console.warn('⚠️  WARNING: API_KEY not set - authentication disabled');
    return next();
  }

  // Extract API key from request
  const requestKey = 
    req.headers['x-api-key'] as string ||
    req.headers['authorization']?.replace('Bearer ', '') ||
    req.query.apiKey as string;

  if (!requestKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via x-api-key header, Authorization header, or apiKey query parameter.'
    });
  }

  if (requestKey !== apiKey) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  // Authentication successful
  next();
}

/**
 * Optional: Rate limiting by API key
 * Tracks request counts per API key to prevent abuse
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimiter(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = 
      req.headers['x-api-key'] as string ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      'anonymous';

    const now = Date.now();
    const record = requestCounts.get(apiKey);

    if (!record || now > record.resetTime) {
      // First request or window expired
      requestCounts.set(apiKey, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const resetIn = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
        retryAfter: resetIn
      });
    }

    record.count++;
    next();
  };
}
