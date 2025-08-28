const db = require('./server/db.js');

async function completeBatch() {
  console.log('Completing batch 166...');
  
  // Update the batch status to completed
  await db.query(`
    UPDATE upload_batches 
    SET status = 'completed',
        completed_at = NOW()
    WHERE id = 166
  `);
  
  console.log('Batch 166 marked as completed');
  
  // Check if results exist
  const results = await db.query(`
    SELECT COUNT(*) as count 
    FROM payee_classifications 
    WHERE batch_id = 166
  `);
  
  console.log(`Found ${results.rows[0].count} classifications for batch 166`);
}

completeBatch().then(() => process.exit(0)).catch(console.error);
