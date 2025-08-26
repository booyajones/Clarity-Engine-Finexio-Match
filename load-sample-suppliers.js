import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function loadSampleSuppliers() {
  console.log('📥 LOADING SUPPLIER DATA FROM CSV...');
  console.log('================================================');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Check current count before clearing
    const beforeCount = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    console.log(`📊 Current suppliers in cache: ${beforeCount.rows[0].count}`);
    console.log('');
    
    // Clear existing cache
    console.log('🧹 Clearing existing cache...');
    await pool.query('TRUNCATE TABLE cached_suppliers');
    console.log('✅ Cache cleared');
    console.log('');
    
    // Check if we have any CSV files with supplier data
    const csvFiles = [
      'finexio-100-suppliers.csv',
      'all-399-companies.csv',
      'large-test-1000.csv'
    ];
    
    let fileToLoad = null;
    for (const file of csvFiles) {
      if (fs.existsSync(file)) {
        fileToLoad = file;
        console.log(`📄 Found supplier file: ${file}`);
        break;
      }
    }
    
    if (!fileToLoad) {
      console.log('⚠️ No supplier CSV files found.');
      console.log('Please upload a CSV file with supplier data.');
      process.exit(1);
    }
    
    // Read and parse CSV file
    const csvContent = fs.readFileSync(fileToLoad, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    
    console.log(`📊 Found ${lines.length - 1} suppliers in ${fileToLoad}`);
    console.log('Headers:', headers.join(', '));
    console.log('');
    
    // Map CSV columns to database columns
    const nameIndex = headers.findIndex(h => 
      h.includes('name') || h.includes('supplier') || h.includes('payee') || h.includes('vendor')
    );
    
    if (nameIndex === -1) {
      console.log('❌ Could not find name column in CSV');
      process.exit(1);
    }
    
    // Insert suppliers
    console.log('📤 Loading suppliers into database...');
    let inserted = 0;
    const batchSize = 100;
    const suppliers = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const name = values[nameIndex];
      
      if (name && name.length > 0) {
        suppliers.push({
          id: `SUP_${i}_${Date.now()}`,
          name: name,
          payment_method: null
        });
      }
    }
    
    // Insert in batches
    for (let i = 0; i < suppliers.length; i += batchSize) {
      const batch = suppliers.slice(i, i + batchSize);
      
      // Build bulk insert values
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      for (const supplier of batch) {
        placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3})`);
        values.push(
          supplier.id,
          supplier.name,
          supplier.payment_method,
          new Date()
        );
        paramIndex += 4;
      }
      
      // Execute bulk insert (using correct column names)
      const insertQuery = `
        INSERT INTO cached_suppliers (payee_id, payee_name, payment_type, created_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (payee_id) DO UPDATE SET
          payee_name = EXCLUDED.payee_name,
          last_updated = NOW()
      `;
      
      await pool.query(insertQuery, values.flat());
      inserted += batch.length;
      
      // Show progress
      const percentage = Math.round((inserted / suppliers.length) * 100);
      process.stdout.write(`\r  [${'>'.repeat(Math.floor(percentage/2))}${' '.repeat(50-Math.floor(percentage/2))}] ${percentage}% (${inserted}/${suppliers.length})`);
    }
    
    console.log('\n');
    console.log('✅ All suppliers loaded successfully');
    console.log('');
    
    // Verify final count
    const finalCount = await pool.query('SELECT COUNT(*) as count FROM cached_suppliers');
    console.log('================================================');
    console.log('📊 LOAD COMPLETE!');
    console.log(`   Previous count: ${beforeCount.rows[0].count}`);
    console.log(`   New count: ${finalCount.rows[0].count}`);
    console.log(`   Source: ${fileToLoad}`);
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
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the load
loadSampleSuppliers().then(() => {
  console.log('\n✨ Supplier data loaded successfully!');
  console.log('Finexio matching should now work properly.');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});