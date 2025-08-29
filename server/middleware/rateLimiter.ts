import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// General API rate limiter - BALANCED: Secure yet functional
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // BALANCED: Secure but allows legitimate testing (was 10000, now 1000)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for health checks and monitoring endpoints
    return req.path.startsWith('/api/health') || 
           req.path.startsWith('/api/monitoring') || 
           req.path === '/api/classify';
  }
});

// Upload rate limiter - FIXED for testing and production use
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // INCREASED: Allow 100 uploads per 15 minutes for testing/concurrent use
  message: 'Too many upload requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// Moderate rate limiter for classification endpoints - BALANCED
export const classificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // BALANCED: Allows testing while preventing abuse (was 10000, now 200)
  message: 'Too many classification requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for expensive operations
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 expensive operations per hour
  message: 'Too many expensive operations requested. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication rate limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});