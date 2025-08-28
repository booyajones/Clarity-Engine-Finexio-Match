import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixBatch() {
  console.log('Fixing batch 167...');
  
  // Simply mark the batch as completed since all processing is done
  await pool.query(`
    UPDATE upload_batches 
    SET status = 'completed',
        completed_at = NOW()
    WHERE id = 167
  `);
  
  console.log('Batch 167 marked as completed');
  
  // Check results
  const results = await pool.query(`
    SELECT COUNT(*) as count 
    FROM payee_classifications 
    WHERE batch_id = 167
  `);
  
  console.log(`Found ${results.rows[0].count} classifications for batch 167`);
  
  await pool.end();
}

fixBatch().catch(console.error);
