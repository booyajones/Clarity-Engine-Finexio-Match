#!/usr/bin/env node

/**
 * Test script for chunked Finexio processing
 * Tests the fix for the 7300 record freeze issue
 */

import { finexioModule } from './server/services/modules/finexioModule.js';
import { storage } from './server/storage.js';
import dotenv from 'dotenv';

dotenv.config();

async function testChunkedProcessing() {
  console.log('\n🧪 Testing Chunked Finexio Processing');
  console.log('=====================================\n');
  
  // Use batch 148 which has 9000 records
  const batchId = 148;
  const batch = await storage.getUploadBatch(batchId);
  
  if (!batch) {
    console.log('❌ Batch not found');
    return;
  }
  
  console.log(`📦 Testing with batch ${batch.id}: ${batch.filename}`);
  console.log(`   Total records: ${batch.totalRecords}`);
  console.log(`   Current status: ${batch.status}`);
  
  // Check if there are classifications to process
  const classifications = await storage.getBatchClassifications(batch.id);
  console.log(`   Classifications found: ${classifications.length}`);
  
  if (classifications.length === 0) {
    console.log('❌ No classifications found for this batch');
    return;
  }
  
  console.log('\n🚀 Starting Finexio matching with chunked processing...');
  console.log('   Processing in chunks of 50 records to prevent connection pool exhaustion\n');
  
  // Track progress
  let lastProgress = 0;
  const progressInterval = setInterval(async () => {
    const updatedBatch = await storage.getUploadBatch(batch.id);
    const progress = updatedBatch?.finexioMatchProgress || 0;
    const processed = updatedBatch?.finexioMatchProcessed || 0;
    const total = updatedBatch?.finexioMatchTotal || classifications.length;
    
    if (progress > lastProgress) {
      console.log(`   📊 Progress: ${progress}% (${processed}/${total} records)`);
      lastProgress = progress;
    }
  }, 2000);
  
  try {
    // Execute the Finexio module with our chunked processing
    await finexioModule.execute(batch.id, {
      enableFinexio: true,
      confidenceThreshold: 0.85
    });
    
    clearInterval(progressInterval);
    
    // Get final results
    const updatedBatch = await storage.getUploadBatch(batch.id);
    console.log('\n✅ Finexio processing completed successfully!');
    console.log(`   Status: ${updatedBatch?.finexioMatchStatus}`);
    console.log(`   Processed: ${updatedBatch?.finexioMatchProcessed}/${updatedBatch?.finexioMatchTotal}`);
    console.log(`   Progress message: ${updatedBatch?.progressMessage}`);
    
  } catch (error) {
    clearInterval(progressInterval);
    console.error('\n❌ Finexio processing failed:', error);
    console.error('   Error details:', error.message);
  }
  
  process.exit(0);
}

// Run the test
testChunkedProcessing().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});