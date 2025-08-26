import pkg from 'pg';
const { Pool } = pkg;
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

async function reloadBigQueryData() {
  console.log('🔄 RELOADING BIGQUERY DATA WITH REDUCED DATASET...');
  console.log('================================================');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Check current count before clearing
    const beforeCount = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    console.log(`📊 Current suppliers in cache: ${beforeCount.rows[0].count}`);
    console.log('');
    
    // Clear existing cache since dataset has been reduced
    console.log('🧹 Clearing existing cache...');
    await pool.query('TRUNCATE TABLE cached_suppliers');
    console.log('✅ Cache cleared');
    console.log('');
    
    // Initialize BigQuery with FinexioPOC project
    console.log('📡 Connecting to BigQuery (FinexioPOC)...');
    const bigquery = new BigQuery({
      projectId: 'finexiopoc',
      credentials: process.env.BIGQUERY_CREDENTIALS ? 
        JSON.parse(process.env.BIGQUERY_CREDENTIALS) : undefined
    });
    
    // Use the SE_Enrichment.supplier table (118K records)
    const dataset = 'SE_Enrichment';
    const table = 'supplier';
    
    // Get ALL distinct records, no deduplication by name
    const query = `
      SELECT DISTINCT
        Reference_ID as payee_id,
        Supplier_Name as payee_name,
        Payment_Method as payment_method,
        Delivery_Method as delivery_method
      FROM \`finexiopoc.${dataset}.${table}\`
      WHERE Supplier_Name IS NOT NULL
        AND LENGTH(TRIM(Supplier_Name)) > 0
      ORDER BY payee_name ASC
    `;
    
    console.log('📥 Fetching reduced dataset from BigQuery...');
    const [rows] = await bigquery.query({ query });
    console.log(`✅ Retrieved ${rows.length} suppliers from BigQuery (reduced dataset)`);
    console.log('');
    
    if (rows.length === 0) {
      console.log('⚠️ No data returned from BigQuery. Please check your query and credentials.');
      process.exit(1);
    }
    
    // Insert in batches for better performance
    const batchSize = 1000;
    let inserted = 0;
    
    console.log('📤 Loading suppliers into database...');
    console.log('Progress:');
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      // Build bulk insert values with unique IDs
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      for (let j = 0; j < batch.length; j++) {
        const supplier = batch[j];
        const uniqueId = `SUP_${i + j}_${Date.now()}`; // Generate unique ID
        
        placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3})`);
        values.push(
          uniqueId, // Use unique ID instead of Reference_ID
          supplier.payee_name,
          supplier.payment_method || null,
          new Date()
        );
        paramIndex += 4;
      }
      
      // Execute bulk insert
      const insertQuery = `
        INSERT INTO cached_suppliers (payee_id, payee_name, payment_type, created_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (payee_id) DO UPDATE SET
          payee_name = EXCLUDED.payee_name,
          payment_type = EXCLUDED.payment_type,
          last_updated = NOW()
      `;
      
      await pool.query(insertQuery, values.flat());
      inserted += batch.length;
      
      // Show progress
      const percentage = Math.round((inserted / rows.length) * 100);
      process.stdout.write(`\r  [${'>'.repeat(Math.floor(percentage/2))}${' '.repeat(50-Math.floor(percentage/2))}] ${percentage}% (${inserted}/${rows.length})`);
    }
    
    console.log('\n');
    console.log('✅ All suppliers loaded successfully');
    console.log('');
    
    // Verify final count
    const finalCount = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    console.log('================================================');
    console.log('📊 RELOAD COMPLETE!');
    console.log(`   Previous count: ${beforeCount.rows[0].count}`);
    console.log(`   New count: ${finalCount.rows[0].count}`);
    console.log(`   Change: ${finalCount.rows[0].count - beforeCount.rows[0].count}`);
    console.log('================================================');
    
    // Create indexes for better performance
    console.log('\n🔨 Creating indexes for optimal performance...');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_name 
      ON cached_suppliers(payee_name)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_name_lower 
      ON cached_suppliers(LOWER(payee_name))
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cached_suppliers_payment_type 
      ON cached_suppliers(payment_type)
      WHERE payment_type IS NOT NULL
    `);
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the reload
reloadBigQueryData().then(() => {
  console.log('\n✨ BigQuery data reload completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});