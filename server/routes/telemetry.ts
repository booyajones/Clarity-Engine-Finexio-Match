/**
 * Telemetry API Routes
 * Lightweight memory monitoring without overhead
 * Based on Phase 3, Item 7 of optimization plan
 */

import { Router } from 'express';
import { memoryUsage } from 'process';

const router = Router();

/**
 * Memory snapshot endpoint - lightweight telemetry
 * From optimization plan Phase 3
 */
router.get('/memory', (req, res) => {
  const mem = memoryUsage();
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    memory: {
      rssMB: +(mem.rss / 1048576).toFixed(1),
      heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
      heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
      externalMB: +(mem.external / 1048576).toFixed(1)
    },
    percentUsed: +((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
    status: getMemoryStatus(mem.heapUsed / mem.heapTotal)
  };
  
  res.json(snapshot);
});

/**
 * Extended telemetry with cache info
 */
router.get('/telemetry', (req, res) => {
  const mem = memoryUsage();
  const uptime = process.uptime();
  
  const telemetry = {
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    },
    memory: {
      rssMB: +(mem.rss / 1048576).toFixed(1),
      heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
      heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
      externalMB: +(mem.external / 1048576).toFixed(1),
      percentUsed: +((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)
    },
    status: getMemoryStatus(mem.heapUsed / mem.heapTotal),
    thresholds: {
      warning: 75,
      critical: 85
    },
    mode: 'single-customer-optimized'
  };
  
  res.json(telemetry);
});

/**
 * Health check with memory awareness
 */
router.get('/health', (req, res) => {
  const mem = memoryUsage();
  const percentage = (mem.heapUsed / mem.heapTotal) * 100;
  
  const health = {
    status: percentage < 85 ? 'healthy' : percentage < 95 ? 'warning' : 'critical',
    memory: {
      percentUsed: +percentage.toFixed(1),
      heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
      heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1)
    },
    timestamp: new Date().toISOString()
  };
  
  // Return appropriate status code
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'warning' ? 207 : 503;
  
  res.status(statusCode).json(health);
});

/**
 * Memory status helper
 */
function getMemoryStatus(percentage: number): string {
  if (percentage < 0.75) return 'healthy';
  if (percentage < 0.85) return 'warning';
  if (percentage < 0.95) return 'critical';
  return 'danger';
}

/**
 * Format uptime to human readable
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

export default router;