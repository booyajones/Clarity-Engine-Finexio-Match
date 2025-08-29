/**
 * Batch Watchdog Service
 * Automatically detects and fixes stuck batches and jobs
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { uploadBatches, payeeClassifications } from '@shared/schema';
import { storage } from '../storage';
import { logger } from './performanceMonitor';

// Configuration
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WATCHDOG_INTERVAL_MS = 60 * 1000; // Run every minute
const MAX_RETRIES = 3;

export class BatchWatchdog {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) {
      logger.info('Batch watchdog already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting batch watchdog service');

    // Run immediately on start
    this.runWatchdog();

    // Then run every minute
    this.intervalId = setInterval(() => {
      this.runWatchdog();
    }, WATCHDOG_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Batch watchdog service stopped');
  }

  private async runWatchdog() {
    try {
      await Promise.all([
        this.checkStuckRows(),
        this.checkStuckBatches(),
        this.checkOrphanedJobs()
      ]);
    } catch (error) {
      logger.error({ error }, 'Watchdog error');
    }
  }

  /**
   * Check for rows stuck in "in_progress" state
   */
  private async checkStuckRows() {
    try {
      const stuckRows = await db.execute(sql`
        UPDATE payee_classifications
        SET 
          enrichment_status = 'failed',
          enrichment_error = 'Processing timeout - marked as failed by watchdog',
          enrichment_completed_at = NOW()
        WHERE 
          enrichment_status = 'in_progress'
          AND enrichment_started_at < NOW() - INTERVAL '5 minutes'
        RETURNING id, batch_id, original_name
      `);

      if (stuckRows.rows.length > 0) {
        logger.warn({ 
          count: stuckRows.rows.length,
          rows: stuckRows.rows.slice(0, 5) // Log first 5 for visibility
        }, 'Fixed stuck rows');
      }
    } catch (error) {
      logger.error({ error }, 'Error checking stuck rows');
    }
  }

  /**
   * Check for batches with no progress
   */
  private async checkStuckBatches() {
    try {
      // Find batches stuck in processing/enriching state
      const stuckBatches = await db.execute(sql`
        SELECT id, status, current_step, updated_at,
               classification_status, finexio_matching_status,
               mastercard_enrichment_status, akkio_prediction_status
        FROM upload_batches
        WHERE 
          status IN ('processing', 'enriching', 'classifying')
          AND updated_at < NOW() - INTERVAL '10 minutes'
      `);

      for (const batch of stuckBatches.rows) {
        logger.warn({ 
          batchId: batch.id,
          status: batch.status,
          lastUpdate: batch.updated_at
        }, 'Found stuck batch');

        // Check if all modules are complete or failed
        const isComplete = this.checkBatchCompletion(batch);
        
        if (isComplete) {
          // Mark batch as completed
          await storage.updateUploadBatch(Number(batch.id), {
            status: 'completed',
            completedAt: new Date(),
            currentStep: 'Processing complete (recovered by watchdog)',
            progressMessage: 'Batch completed after recovery'
          });
          
          logger.info({ batchId: batch.id }, 'Marked stuck batch as completed');
        } else {
          // Mark any stuck module statuses as failed
          const updates: any = {};
          
          if (batch.classification_status === 'processing') {
            updates.classificationStatus = 'failed';
          }
          if (batch.finexio_matching_status === 'processing') {
            updates.finexioMatchingStatus = 'failed';
          }
          if (batch.mastercard_enrichment_status === 'processing') {
            updates.mastercardEnrichmentStatus = 'failed';
          }
          if (batch.akkio_prediction_status === 'processing') {
            updates.akkioPredictionStatus = 'failed';
          }
          
          if (Object.keys(updates).length > 0) {
            updates.status = 'completed';
            updates.completedAt = new Date();
            updates.currentStep = 'Processing complete with failures';
            updates.progressMessage = 'Batch completed with some module failures (recovered by watchdog)';
            
            await storage.updateUploadBatch(Number(batch.id), updates);
            logger.info({ batchId: batch.id, updates }, 'Marked stuck modules as failed');
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error checking stuck batches');
    }
  }

  /**
   * Check for orphaned jobs (jobs with no corresponding batch)
   */
  private async checkOrphanedJobs() {
    try {
      // Clean up classifications for deleted batches
      const orphaned = await db.execute(sql`
        DELETE FROM payee_classifications
        WHERE batch_id NOT IN (SELECT id FROM upload_batches)
        RETURNING id
      `);

      if (orphaned.rows.length > 0) {
        logger.info({ count: orphaned.rows.length }, 'Cleaned up orphaned classifications');
      }
    } catch (error) {
      logger.error({ error }, 'Error checking orphaned jobs');
    }
  }

  /**
   * Check if all batch modules are complete
   */
  private checkBatchCompletion(batch: any): boolean {
    const completedStatuses = ['completed', 'skipped', 'failed'];
    
    return (
      completedStatuses.includes(batch.classification_status || 'skipped') &&
      completedStatuses.includes(batch.finexio_matching_status || 'skipped') &&
      completedStatuses.includes(batch.mastercard_enrichment_status || 'skipped') &&
      completedStatuses.includes(batch.akkio_prediction_status || 'skipped')
    );
  }

  /**
   * Force complete a specific batch
   */
  async forceCompleteBatch(batchId: number) {
    try {
      logger.info({ batchId }, 'Force completing batch');
      
      // Mark all in-progress rows as failed
      await db.execute(sql`
        UPDATE payee_classifications
        SET 
          enrichment_status = 'failed',
          enrichment_error = 'Force completed by admin',
          enrichment_completed_at = NOW()
        WHERE 
          batch_id = ${batchId}
          AND enrichment_status = 'in_progress'
      `);
      
      // Mark batch as completed
      await storage.updateUploadBatch(batchId, {
        status: 'completed',
        completedAt: new Date(),
        currentStep: 'Force completed',
        progressMessage: 'Batch force completed by admin',
        classificationStatus: 'completed',
        finexioMatchingStatus: 'completed',
        mastercardEnrichmentStatus: 'skipped',
        akkioPredictionStatus: 'skipped'
      });
      
      logger.info({ batchId }, 'Batch force completed successfully');
    } catch (error) {
      logger.error({ batchId, error }, 'Error force completing batch');
      throw error;
    }
  }

  /**
   * Public method to check for stuck batches (exposed via API)
   * This method is called from monitoring routes
   */
  async checkStuckBatches() {
    const STUCK_THRESHOLD_MINUTES = 10;
    
    try {
      const stuckBatches = await db.execute(sql`
        SELECT id, status, current_step, created_at, 
               classification_status, finexio_matching_status,
               mastercard_enrichment_status, akkio_prediction_status
        FROM upload_batches
        WHERE 
          status IN ('processing', 'enriching', 'classifying')
          AND created_at < NOW() - INTERVAL '10 minutes'
      `);
      
      return stuckBatches.rows || [];
    } catch (error) {
      logger.error({ error }, 'Error checking stuck batches via API');
      return [];
    }
  }
}

// Create singleton instance
export const batchWatchdog = new BatchWatchdog();

// Start watchdog automatically in production
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_WATCHDOG === 'true') {
  batchWatchdog.start();
}