/**
 * Timeout utility to prevent jobs from hanging forever
 */

export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number = 15000,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`${errorMessage} after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

export function createTimeoutWrapper(defaultTimeout: number = 15000) {
  return <T>(promise: Promise<T>, customTimeout?: number, errorMessage?: string) => 
    withTimeout(promise, customTimeout || defaultTimeout, errorMessage);
}

// Stage-specific timeout configurations
export const STAGE_TIMEOUTS = {
  classification: 15000,  // 15s per classification call
  finexio: 8000,         // 8s per Finexio match
  address: 10000,        // 10s per address validation
  mastercard: 30000,     // 30s for Mastercard submission
  akkio: 20000,          // 20s for Akkio prediction
  database: 5000,        // 5s for database operations
  batch: 60000           // 60s for batch operations
};

// Create pre-configured timeout wrappers for each stage
export const classificationTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.classification);
export const finexioTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.finexio);
export const addressTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.address);
export const mastercardTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.mastercard);
export const akkioTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.akkio);
export const databaseTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.database);
export const batchTimeout = createTimeoutWrapper(STAGE_TIMEOUTS.batch);