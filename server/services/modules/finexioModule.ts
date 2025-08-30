/**
 * Finexio Matching Module
 * 
 * Self-contained module for Finexio supplier matching.
 * Can be executed independently or as part of a pipeline.
 */

import { PipelineModule } from '../pipelineOrchestrator';
import { finexioMatcherV3 } from '../finexioMatcherV3';
import { storage } from '../../storage';

class FinexioModule implements PipelineModule {
  name = 'finexio';
  enabled = true;
  order = 2; // Second in pipeline
  statusField = 'finexioMatchStatus';
  completedField = 'finexioMatchCompletedAt';

  async execute(batchId: number, options: any = {}): Promise<void> {
    console.log(`💼 Finexio Module: Starting for batch ${batchId}`);
    
    // Check if Finexio matching is enabled
    if (options.enableFinexio === false) {
      console.log('Finexio matching disabled - skipping');
      
      // Get batch to get total records  
      const batch = await storage.getUploadBatchById(batchId);
      const totalRecords = batch?.processedRecords || batch?.totalRecords || 0;
      
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: 'skipped',
        finexioMatchingCompletedAt: new Date(),
        finexioMatchingProgress: totalRecords,
        finexioMatchingProcessed: totalRecords,
        finexioMatchingTotal: totalRecords
      });
      return;
    }
    
    try {
      // Update status
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: 'processing',
        currentStep: 'Matching with Finexio suppliers',
        progressMessage: 'Searching Finexio supplier database...'
      });

      // Get classifications for this batch
      const classifications = await storage.getBatchClassifications(batchId);
      
      if (classifications.length === 0) {
        console.log(`⚠️ No classifications found for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          finexioMatchingStatus: 'skipped',
          finexioMatchingCompletedAt: new Date()
        });
        return;
      }

      let matchedCount = 0;
      let processedCount = 0;
      const totalCount = classifications.length;
      
      // Adaptive chunk sizing based on memory usage and record count
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      // Smaller chunks to prevent timeouts and better track progress
      let CHUNK_SIZE = 50; // Reduced to prevent hangs
      if (heapUsedMB < 100) {
        CHUNK_SIZE = 75; // Slightly more with low memory
      } else if (heapUsedMB > 200) {
        CHUNK_SIZE = 25; // Much smaller if memory is high
      }
      
      // Adjust for very large batches
      if (totalCount > 5000) {
        CHUNK_SIZE = Math.min(CHUNK_SIZE, 50);
      }
      
      const chunks = [];
      for (let i = 0; i < classifications.length; i += CHUNK_SIZE) {
        chunks.push(classifications.slice(i, i + CHUNK_SIZE));
      }

      console.log(`📦 Processing ${totalCount} classifications in ${chunks.length} chunks of ${CHUNK_SIZE}`);
      console.log(`💾 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB heap used`);

      // Process each chunk with TRUE parallel processing
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const startTime = Date.now();
        
        try {
          // Process ALL records in chunk in parallel using V3 matcher's concurrency control
          const chunkPromises = chunk.map(async (classification) => {
            // Add timeout wrapper for each match operation
            const timeoutPromise = new Promise<{ matched: boolean; error?: boolean; timeout?: boolean }>((resolve) => {
              setTimeout(() => {
                console.warn(`⏱️ Timeout for payee ${classification.id}: ${classification.originalName}`);
                resolve({ matched: false, timeout: true });
              }, 30000); // 30 second timeout per record
            });
            
            const matchPromise = (async () => {
              try {
                console.log(`🔍 Matching payee ${classification.id}: ${classification.cleanedName || classification.originalName}`);
                
                // Use the new streamlined V3 matcher (DB→Rules→AI)
                // The V3 matcher internally uses pLimit to control concurrency
                const result = await finexioMatcherV3.match(
                  classification.cleanedName || classification.originalName,
                  {
                    city: classification.city,
                    state: classification.state
                  }
                );

                if (result.matched && result.supplierId) {
                  // Update classification with Finexio match
                  await storage.updatePayeeClassification(classification.id, {
                    finexioSupplierId: result.supplierId,
                    finexioSupplierName: classification.cleanedName || classification.originalName,
                    finexioConfidence: result.confidence,
                    finexioMatchReasoning: `${result.method}: ${result.reasoning}` // Combined method and reasoning
                  });
                  return { matched: true };
                } else {
                  // Even if no match, record that we attempted matching
                  await storage.updatePayeeClassification(classification.id, {
                    finexioConfidence: 0, // No match found
                    finexioMatchReasoning: 'No matching supplier found'
                  });
                  return { matched: false };
                }
              } catch (error) {
                console.error(`Error matching payee ${classification.id}:`, error);
                
                // CRITICAL: Always update the database even on errors to prevent stuck jobs
                try {
                  await storage.updatePayeeClassification(classification.id, {
                    finexioConfidence: 0, // Mark as processed but no match
                    finexioMatchReasoning: `Error during matching: ${error.message || 'Unknown error'}`
                  });
                } catch (updateError) {
                  console.error(`Failed to update error status for payee ${classification.id}:`, updateError);
                }
                
                // Return error but don't fail the whole chunk
                return { matched: false, error: true };
              }
            })();
            
            // Race between the actual match and timeout
            const result = await Promise.race([matchPromise, timeoutPromise]);
            
            // If timeout occurred, update database to prevent stuck state
            if (result.timeout) {
              try {
                await storage.updatePayeeClassification(classification.id, {
                  finexioConfidence: 0,
                  finexioMatchReasoning: 'Matching timeout - skipped'
                });
              } catch (error) {
                console.error(`Failed to update timeout status for payee ${classification.id}:`, error);
              }
            }
            
            return result;
          });

          // Use Promise.allSettled instead of Promise.all to continue even if some fail
          const chunkSettledResults = await Promise.allSettled(chunkPromises);
          
          // Extract actual results from settled promises
          const chunkResults = chunkSettledResults.map((result, index) => {
            if (result.status === 'fulfilled') {
              return result.value;
            } else {
              console.error(`Failed to process payee at index ${index}:`, result.reason);
              return { matched: false, error: true };
            }
          });
          
          // Count matches
          const chunkMatches = chunkResults.filter(r => r.matched).length;
          matchedCount += chunkMatches;
          processedCount += chunk.length;

          // Calculate performance metrics
          const elapsedMs = Date.now() - startTime;
          const recordsPerSecond = Math.round((chunk.length / elapsedMs) * 1000);

          // Update progress after each chunk
          const progress = Math.round((processedCount / totalCount) * 100);
          await storage.updateUploadBatch(batchId, {
            finexioMatchingProgress: progress,
            progressMessage: `Finexio: Matched ${matchedCount}/${processedCount} (${progress}%)...`
          });
          
          console.log(`⚡ Chunk ${chunkIndex + 1}: Processed ${chunk.length} records in ${elapsedMs}ms (${recordsPerSecond} records/sec, ${chunkMatches} matches)`);
          
          // Memory management between chunks
          if (chunkIndex < chunks.length - 1) {
            // Force garbage collection if available (Node.js must be run with --expose-gc flag)
            if (global.gc) {
              global.gc();
            }
            
            // Adaptive delay based on performance and memory
            let delayMs = 100; // Base delay
            if (recordsPerSecond < 10) {
              delayMs = 500; // Longer delay if processing is slow
            } else if (recordsPerSecond < 30) {
              delayMs = 200; // Medium delay
            }
            
            // Check memory pressure
            const currentMemUsage = process.memoryUsage();
            const currentHeapUsedMB = Math.round(currentMemUsage.heapUsed / 1024 / 1024);
            if (currentHeapUsedMB > 250) {
              delayMs = Math.max(delayMs, 1000); // Longer delay if memory is high
              console.log(`⚠️ High memory usage: ${currentHeapUsedMB}MB, adding ${delayMs}ms delay`);
            }
            
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          console.error(`❌ Failed to process chunk ${chunkIndex + 1}:`, error);
          // Continue with next chunk instead of failing completely
        }
      }

      // Update final status
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: 'completed',
        finexioMatchingCompletedAt: new Date(),
        finexioMatchingProgress: 100,
        finexioMatchedCount: matchedCount,
        finexioMatchingProcessed: processedCount,
        finexioMatchingMatched: matchedCount,
        currentStep: 'Finexio matching complete',
        progressMessage: `Matched ${matchedCount}/${processedCount} payees with Finexio suppliers`
      });
      
      // CRITICAL: Check if batch should be marked as completed
      // If no other modules are configured to run after Finexio, mark as completed
      const batch = await storage.getUploadBatch(batchId);
      if (batch && 
          batch.googleAddressStatus === 'skipped' && 
          batch.mastercardEnrichmentStatus === 'skipped' && 
          batch.akkioPredictionStatus === 'skipped') {
        // All enrichment modules are skipped, mark batch as completed
        await storage.updateUploadBatch(batchId, {
          status: 'completed',
          completedAt: new Date(),
          progressMessage: 'Processing complete!'
        });
        console.log(`✅ Batch ${batchId} marked as COMPLETED (all enrichment skipped)`);
      }

      console.log(`✅ Finexio Module: Completed for batch ${batchId} (${matchedCount}/${processedCount} matched)`);
    } catch (error) {
      console.error(`❌ Finexio Module: Failed for batch ${batchId}:`, error);
      
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: 'error',
        currentStep: 'Finexio matching failed',
        progressMessage: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      throw error;
    }
  }
}

export const finexioModule = new FinexioModule();