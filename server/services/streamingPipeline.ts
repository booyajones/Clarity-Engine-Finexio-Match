import { pipeline, Transform, Readable } from 'stream';
import { promisify } from 'util';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { progressivePipeline } from './progressivePipeline';
import { db } from '@db';
import { payeeClassifications } from '@shared/schema';
import { memoryManager } from './memoryManager';

const pipelineAsync = promisify(pipeline);

interface ProcessingOptions {
  batchId: number;
  userId?: number;
  enableFinexio?: boolean;
  enableMastercard?: boolean;
  enableGoogleAddress?: boolean;
  signal?: AbortSignal;
}

interface ProcessingMetrics {
  totalRows: number;
  processedRows: number;
  errorRows: number;
  startTime: number;
  currentBatchSize: number;
  currentConcurrency: number;
  memoryPressure: 'low' | 'medium' | 'high' | 'critical';
  rowsPerSecond: number;
}

/**
 * Streaming Pipeline for Large File Processing
 * Handles 10k+ rows efficiently with backpressure and memory management
 */
export class StreamingPipeline {
  private metrics: ProcessingMetrics;
  private buffer: any[] = [];
  private inProgress = new Map<string, Promise<any>>();
  
  // Dynamic settings that adjust based on memory
  private BATCH_SIZE = 250;
  private CONCURRENCY = 16;
  private readonly MIN_BATCH = 50;
  private readonly MAX_BATCH = 500;
  private readonly MIN_CONCURRENCY = 2;
  private readonly MAX_CONCURRENCY = 32;
  
  constructor() {
    this.metrics = this.resetMetrics();
    
    // Monitor memory every 2 seconds and adjust
    setInterval(() => this.adaptToMemory(), 2000);
  }

  /**
   * Process a CSV file with streaming and backpressure
   */
  async processFile(
    filePath: string,
    options: ProcessingOptions
  ): Promise<ProcessingMetrics> {
    console.log(`🚀 Starting streaming pipeline for batch ${options.batchId}`);
    this.metrics = this.resetMetrics();
    
    // Create concurrency limiter
    const limit = pLimit(this.CONCURRENCY);
    
    // Process with backpressure
    await pipelineAsync(
      fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }),
      csv(),
      this.createBackpressureTransform(limit, options),
      this.createProgressReporter(options.batchId)
    );
    
    // Process any remaining buffer
    if (this.buffer.length > 0) {
      await this.flushBuffer(limit, options);
    }
    
    // Wait for in-flight operations
    await Promise.all(this.inProgress.values());
    
    console.log(`✅ Streaming pipeline complete: ${this.metrics.processedRows} rows processed`);
    return this.metrics;
  }

  /**
   * Create a transform stream with backpressure handling
   */
  private createBackpressureTransform(
    limit: pLimit.Limit,
    options: ProcessingOptions
  ): Transform {
    return new Transform({
      objectMode: true,
      transform: async (row, encoding, callback) => {
        try {
          // Check for abort signal
          if (options.signal?.aborted) {
            return callback(new Error('Processing aborted'));
          }
          
          this.metrics.totalRows++;
          this.buffer.push(row);
          
          // Flush when buffer reaches dynamic batch size
          if (this.buffer.length >= this.BATCH_SIZE) {
            await this.flushBuffer(limit, options);
          }
          
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      flush: async (callback) => {
        try {
          // Process remaining buffer
          if (this.buffer.length > 0) {
            await this.flushBuffer(limit, options);
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      }
    });
  }

  /**
   * Flush buffer and process batch
   */
  private async flushBuffer(
    limit: pLimit.Limit,
    options: ProcessingOptions
  ): Promise<void> {
    const batch = this.buffer;
    this.buffer = [];
    
    // Process batch with concurrency control
    const promises = batch.map(row => 
      limit(() => this.processRow(row, options))
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Process a single row through the pipeline
   */
  private async processRow(
    row: any,
    options: ProcessingOptions
  ): Promise<void> {
    const payeeName = row.payee_name || row.vendor_name || row.name || '';
    if (!payeeName) {
      this.metrics.errorRows++;
      return;
    }
    
    // De-duplicate in-flight requests
    const key = this.normalizeKey(payeeName);
    if (this.inProgress.has(key)) {
      await this.inProgress.get(key);
      this.metrics.processedRows++;
      return;
    }
    
    // Process with progressive pipeline
    const promise = this.processWithPipeline(row, options);
    this.inProgress.set(key, promise);
    
    try {
      await promise;
      this.metrics.processedRows++;
    } catch (error) {
      console.error(`Error processing row: ${error}`);
      this.metrics.errorRows++;
    } finally {
      this.inProgress.delete(key);
    }
  }

  /**
   * Process row through progressive enhancement pipeline
   */
  private async processWithPipeline(
    row: any,
    options: ProcessingOptions
  ): Promise<void> {
    const payeeName = row.payee_name || row.vendor_name || row.name || '';
    
    // Use progressive pipeline for classification
    const result = await progressivePipeline.classify(payeeName, {
      amount: parseFloat(row.amount) || undefined,
      address: row.address,
      city: row.city,
      state: row.state,
      category: row.category
    });
    
    // Prepare bulk insert data
    const classification = {
      batchId: options.batchId,
      userId: options.userId || 1,
      originalName: payeeName,
      normalizedName: this.normalizeKey(payeeName),
      payeeType: result.payeeType,
      confidence: result.confidence,
      sicCode: result.sicCode,
      sicDescription: result.sicDescription,
      processingMethod: result.method,
      processingTime: result.processingTime,
      amount: parseFloat(row.amount) || null,
      address: row.address || null,
      city: row.city || null,
      state: row.state || null,
      zip: row.zip || null,
      needsReview: result.confidence < 0.8,
      metadata: {
        originalRow: row,
        reasoning: result.reasoning
      }
    };
    
    // Add to batch insert queue (would implement bulk insert here)
    await this.addToBulkInsert(classification);
  }

  /**
   * Add to bulk insert queue
   */
  private bulkInsertQueue: any[] = [];
  private async addToBulkInsert(data: any): Promise<void> {
    this.bulkInsertQueue.push(data);
    
    // Flush every 250 records
    if (this.bulkInsertQueue.length >= 250) {
      await this.flushBulkInsert();
    }
  }

  /**
   * Flush bulk insert queue
   */
  private async flushBulkInsert(): Promise<void> {
    if (this.bulkInsertQueue.length === 0) return;
    
    const batch = this.bulkInsertQueue;
    this.bulkInsertQueue = [];
    
    try {
      // Bulk insert with multi-row VALUES
      await db.insert(payeeClassifications).values(batch);
    } catch (error) {
      console.error('Bulk insert error:', error);
      // Could implement retry logic here
    }
  }

  /**
   * Adapt processing to current memory pressure
   */
  private async adaptToMemory(): Promise<void> {
    const memStats = memoryManager.getMemoryStats();
    const usage = memStats.heapUsedPercent;
    
    // Determine memory pressure level
    let pressure: 'low' | 'medium' | 'high' | 'critical';
    if (usage < 60) {
      pressure = 'low';
    } else if (usage < 75) {
      pressure = 'medium';
    } else if (usage < 85) {
      pressure = 'high';
    } else {
      pressure = 'critical';
    }
    
    this.metrics.memoryPressure = pressure;
    
    // Adjust batch size and concurrency based on pressure
    switch (pressure) {
      case 'low':
        // Increase performance
        this.BATCH_SIZE = Math.min(this.MAX_BATCH, this.BATCH_SIZE + 50);
        this.CONCURRENCY = Math.min(this.MAX_CONCURRENCY, this.CONCURRENCY + 2);
        break;
        
      case 'medium':
        // Maintain current settings
        break;
        
      case 'high':
        // Reduce load
        this.BATCH_SIZE = Math.max(this.MIN_BATCH, this.BATCH_SIZE - 50);
        this.CONCURRENCY = Math.max(this.MIN_CONCURRENCY + 4, this.CONCURRENCY - 4);
        console.log(`⚠️ High memory pressure (${usage.toFixed(1)}%), reducing batch to ${this.BATCH_SIZE}, concurrency to ${this.CONCURRENCY}`);
        break;
        
      case 'critical':
        // Emergency reduction
        this.BATCH_SIZE = this.MIN_BATCH;
        this.CONCURRENCY = this.MIN_CONCURRENCY;
        console.log(`🚨 Critical memory (${usage.toFixed(1)}%), emergency throttle: batch=${this.BATCH_SIZE}, concurrency=${this.CONCURRENCY}`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        break;
    }
    
    // Update metrics
    this.metrics.currentBatchSize = this.BATCH_SIZE;
    this.metrics.currentConcurrency = this.CONCURRENCY;
  }

  /**
   * Create progress reporter transform
   */
  private createProgressReporter(batchId: number): Transform {
    let lastReport = Date.now();
    let rowCount = 0;
    
    return new Transform({
      objectMode: true,
      transform: (chunk, encoding, callback) => {
        rowCount++;
        
        // Report progress every 500ms
        const now = Date.now();
        if (now - lastReport > 500) {
          const elapsed = (now - this.metrics.startTime) / 1000;
          this.metrics.rowsPerSecond = rowCount / elapsed;
          
          console.log(`📊 Batch ${batchId}: ${rowCount} rows, ${this.metrics.rowsPerSecond.toFixed(1)} rows/sec, Memory: ${this.metrics.memoryPressure}, Batch: ${this.BATCH_SIZE}, Concurrency: ${this.CONCURRENCY}`);
          
          lastReport = now;
        }
        
        callback(null, chunk);
      }
    });
  }

  /**
   * Normalize key for deduplication
   */
  private normalizeKey(name: string): string {
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): ProcessingMetrics {
    return {
      totalRows: 0,
      processedRows: 0,
      errorRows: 0,
      startTime: Date.now(),
      currentBatchSize: this.BATCH_SIZE,
      currentConcurrency: this.CONCURRENCY,
      memoryPressure: 'low',
      rowsPerSecond: 0
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): ProcessingMetrics {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    this.metrics.rowsPerSecond = this.metrics.processedRows / Math.max(1, elapsed);
    return this.metrics;
  }

  /**
   * Emergency stop
   */
  async emergencyStop(): Promise<void> {
    console.log('🛑 Emergency stop initiated');
    
    // Flush any pending bulk inserts
    await this.flushBulkInsert();
    
    // Clear buffers
    this.buffer = [];
    this.inProgress.clear();
    
    // Reset to minimum resources
    this.BATCH_SIZE = this.MIN_BATCH;
    this.CONCURRENCY = this.MIN_CONCURRENCY;
  }
}

// Export singleton instance
export const streamingPipeline = new StreamingPipeline();