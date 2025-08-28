import { db } from './server/db.js';
import { uploadBatches } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { pipelineOrchestrator } from './server/services/pipelineOrchestrator.js';

async function restartEnrichment() {
  const batchId = 165;
  
  console.log(`Restarting enrichment for batch ${batchId}...`);
  
  try {
    // Update batch status back to enriching
    await db.update(uploadBatches)
      .set({
        status: 'enriching',
        currentStep: 'Restarting enrichment pipeline',
        progressMessage: 'Restarting Finexio matching and other enrichments...',
        finexioMatchingStatus: 'pending',
        finexioMatchingProgress: 0,
        finexioMatchedCount: 0
      })
      .where(eq(uploadBatches.id, batchId));
    
    console.log('Batch status updated, starting enrichment pipeline...');
    
    // Start the enrichment pipeline with only Finexio enabled
    await pipelineOrchestrator.executePipeline(batchId, {
      enabledModules: ['finexio'],
      finexio: { retry: true }
    });
    
    console.log('Enrichment pipeline started successfully!');
  } catch (error) {
    console.error('Error restarting enrichment:', error);
  }
  
  process.exit(0);
}

restartEnrichment();