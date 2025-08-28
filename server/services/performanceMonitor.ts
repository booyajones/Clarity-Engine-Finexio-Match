/**
 * Performance Monitoring Service
 * Implements Prometheus metrics and observability as per performance recommendations
 */

import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import pino from 'pino';

// Initialize structured logging with pino (simplified for compatibility)
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ prefix: 'clarityengine_' });

// Pipeline metrics
export const batchProcessingTime = new Histogram({
  name: 'clarityengine_pipeline_batch_seconds',
  help: 'Time taken to process batches by stage',
  labelNames: ['stage', 'batch_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
});

// Classification metrics
export const classificationTime = new Histogram({
  name: 'clarityengine_classification_seconds',
  help: 'Time taken for classification operations',
  labelNames: ['method'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

export const classificationErrors = new Counter({
  name: 'clarityengine_classification_errors_total',
  help: 'Total number of classification errors',
  labelNames: ['error_type']
});

export const classificationCacheHits = new Counter({
  name: 'clarityengine_classification_cache_hits_total',
  help: 'Number of classification cache hits'
});

export const classificationCacheMisses = new Counter({
  name: 'clarityengine_classification_cache_misses_total',
  help: 'Number of classification cache misses'
});

// Finexio matching metrics
export const finexioQueryTime = new Histogram({
  name: 'clarityengine_finexio_query_seconds',
  help: 'Time taken for Finexio database queries',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

export const finexioCandidatesFound = new Histogram({
  name: 'clarityengine_finexio_candidates_found',
  help: 'Number of candidates found per query',
  buckets: [0, 1, 2, 5, 10, 20, 50, 100]
});

export const finexioMatchRate = new Gauge({
  name: 'clarityengine_finexio_match_rate',
  help: 'Current Finexio match rate percentage'
});

// Address validation metrics
export const addressValidationTime = new Histogram({
  name: 'clarityengine_address_validation_seconds',
  help: 'Time taken for Google address validation',
  buckets: [0.1, 0.25, 0.5, 1, 2, 5]
});

// Mastercard metrics
export const mastercardSubmitTime = new Histogram({
  name: 'clarityengine_mastercard_submit_seconds',
  help: 'Time taken to submit Mastercard requests',
  buckets: [0.5, 1, 2, 5, 10, 30]
});

export const mastercardQueueSize = new Gauge({
  name: 'clarityengine_mastercard_queue_size',
  help: 'Current size of Mastercard processing queue'
});

// Memory metrics
export const heapUsageGauge = new Gauge({
  name: 'clarityengine_heap_usage_percent',
  help: 'Current heap usage as percentage of max'
});

export const gcRunsCounter = new Counter({
  name: 'clarityengine_gc_runs_total',
  help: 'Total number of manual garbage collection runs'
});

// Alert thresholds
const ALERT_THRESHOLDS = {
  classificationTimeoutRate: 0.1, // 10%
  finexioNoCandidatesRate: 0.2, // 20%
  heapUsagePercent: 0.7, // 70%
  errorRate: 0.05 // 5%
};

// Monitor heap usage periodically
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapPercent = memUsage.heapUsed / memUsage.heapTotal;
  heapUsageGauge.set(heapPercent * 100);
  
  // Alert if heap usage is too high
  if (heapPercent > ALERT_THRESHOLDS.heapUsagePercent) {
    logger.warn({
      alert: 'HIGH_HEAP_USAGE',
      heapPercent: (heapPercent * 100).toFixed(2),
      heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(2)
    }, 'High heap usage detected');
    
    // Trigger garbage collection if available
    if (global.gc) {
      logger.info('Running garbage collection due to high heap usage');
      global.gc();
      gcRunsCounter.inc();
    }
  }
}, 30000); // Check every 30 seconds

// Export metrics endpoint handler
export function getMetrics(): Promise<string> {
  return register.metrics();
}

// Structured logging helpers
export function logBatchStart(batchId: number, totalRecords: number) {
  logger.info({
    event: 'batch_start',
    batch_id: batchId,
    total_records: totalRecords
  }, `Starting batch ${batchId} with ${totalRecords} records`);
}

export function logBatchComplete(batchId: number, duration: number, recordsPerSecond: number) {
  logger.info({
    event: 'batch_complete',
    batch_id: batchId,
    duration_seconds: duration,
    records_per_second: recordsPerSecond
  }, `Batch ${batchId} completed in ${duration}s (${recordsPerSecond.toFixed(1)} rec/s)`);
}

export function logStageComplete(stage: string, batchId: number, duration: number, successRate: number) {
  logger.info({
    event: 'stage_complete',
    stage,
    batch_id: batchId,
    duration_seconds: duration,
    success_rate: successRate
  }, `Stage ${stage} completed for batch ${batchId}`);
}

export function logError(context: string, error: any, details?: any) {
  logger.error({
    event: 'error',
    context,
    error: error.message || error,
    stack: error.stack,
    ...details
  }, `Error in ${context}: ${error.message || error}`);
}

// Memory management helpers
export function clearArraysAndGC(...arrays: any[]) {
  // Clear all provided arrays
  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      arr.length = 0;
    }
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    gcRunsCounter.inc();
  }
}

// Export all metrics and utilities
export default {
  logger,
  getMetrics,
  logBatchStart,
  logBatchComplete,
  logStageComplete,
  logError,
  clearArraysAndGC,
  metrics: {
    batchProcessingTime,
    classificationTime,
    classificationErrors,
    classificationCacheHits,
    classificationCacheMisses,
    finexioQueryTime,
    finexioCandidatesFound,
    finexioMatchRate,
    addressValidationTime,
    mastercardSubmitTime,
    mastercardQueueSize,
    heapUsageGauge,
    gcRunsCounter
  }
};