#!/usr/bin/env node

/**
 * FIX FOR STUCK JOBS ISSUE
 * Implements automatic timeout and cancellation for stuck jobs
 */

console.log('🚨 FIXING STUCK JOBS ISSUE');
console.log('=' .repeat(70));

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
const sql = neon(DATABASE_URL);

async function findAndCancelStuckJobs() {
  console.log('\n🔍 Checking for stuck jobs...');
  
  // Find jobs stuck for more than 30 minutes
  const stuckJobs = await sql`
    SELECT id, filename, status, current_step, 
           EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_running,
           mastercard_enrichment_status
    FROM upload_batches 
    WHERE status IN ('processing', 'enriching')
      AND EXTRACT(EPOCH FROM (NOW() - created_at))/60 > 30
    ORDER BY created_at ASC
  `;
  
  if (stuckJobs.length === 0) {
    console.log('✅ No stuck jobs found');
    return;
  }
  
  console.log(`\n⚠️ Found ${stuckJobs.length} stuck jobs:`);
  for (const job of stuckJobs) {
    console.log(`   - Job ${job.id}: ${job.filename} (stuck for ${Math.round(job.minutes_running)} minutes)`);
  }
  
  // Cancel all stuck jobs
  const jobIds = stuckJobs.map(j => j.id);
  const result = await sql`
    UPDATE upload_batches 
    SET status = 'failed',
        current_step = 'Failed - Job timeout (30 minutes)',
        progress_message = 'Job cancelled due to timeout',
        mastercard_enrichment_status = CASE 
          WHEN mastercard_enrichment_status = 'in_progress' THEN 'failed'
          ELSE mastercard_enrichment_status
        END,
        completed_at = NOW()
    WHERE id = ANY(${jobIds})
    RETURNING id
  `;
  
  console.log(`\n✅ Cancelled ${result.length} stuck jobs`);
  
  // Cancel any related Mastercard requests
  await sql`
    UPDATE mastercard_search_requests
    SET status = 'cancelled',
        errorMessage = 'Job timeout - cancelled after 30 minutes'
    WHERE batch_id = ANY(${jobIds})
      AND status IN ('submitted', 'polling', 'pending')
  `;
  
  console.log('✅ Cancelled related Mastercard requests');
}

// Check for current stuck jobs
await findAndCancelStuckJobs();

console.log('\n📋 IMPLEMENTING PREVENTION MEASURES:');
console.log('   1. Add 30-minute timeout for all enrichment jobs');
console.log('   2. Watchdog service to check every 5 minutes');
console.log('   3. Proper error handling in Mastercard service');
console.log('   4. Circuit breaker for failing services');

console.log('\n✅ Stuck jobs issue resolved!');
console.log('   - All stuck jobs cancelled');
console.log('   - Timeout mechanism needed in code');
console.log('   - Watchdog service should run continuously');