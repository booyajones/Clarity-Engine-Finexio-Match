import { BigQuery } from '@google-cloud/bigquery';
import { db } from './server/db';
import { cachedSuppliers } from './shared/schema';
import { sql } from 'drizzle-orm';

async function fastBigQuerySync() {
  console.log('\n🚀 FAST SYNC: LOADING ALL 118,586 SUPPLIERS FROM BIGQUERY');
  console.log('=' .repeat(60));
  
  try {
    const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}');
    const bigquery = new BigQuery({
      projectId: 'finexiopoc',
      credentials: credentials,
    });
    
    // Get current count
    const currentCount = await db.select({ 
      count: sql`COUNT(*)` 
    }).from(cachedSuppliers);
    
    console.log(`📊 Current cache: ${currentCount[0].count} suppliers`);
    
    // Query ALL suppliers from BigQuery
    const query = `SELECT * FROM \`finexiopoc.SE_Enrichment.supplier\``;
    
    console.log('📥 Fetching ALL suppliers from BigQuery...');
    const [rows] = await bigquery.query({ query, location: 'US' });
    
    console.log(`✅ Found ${rows.length} suppliers in BigQuery`);
    
    // Clear existing cache for clean load
    console.log('🧹 Clearing existing cache...');
    await db.delete(cachedSuppliers);
    
    // Process in large batches for speed
    const batchSize = 5000;
    let processed = 0;
    
    console.log('📦 Fast loading suppliers in batches of 5000...');
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      // Build unique suppliers with correct column names
      const suppliers = batch.map((row, index) => {
        const uniqueId = row.Reference_ID || `ROW_${i + index}_${Date.now()}`;
        return {
          payeeId: `BQ_${uniqueId}`,
          payeeName: row.Supplier_Name || '',
          normalizedName: (row.Supplier_Name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
          paymentType: row.Payment_Method || row.Delivery_Method || 'CHECK',
        };
      });
      
      // Insert batch with conflict handling
      await db.insert(cachedSuppliers)
        .values(suppliers)
        .onConflictDoNothing();
      
      processed += batch.length;
      console.log(`  ✅ Loaded ${processed}/${rows.length} (${Math.round(processed * 100 / rows.length)}%)`);
    }
    
    // Verify final count
    const finalCount = await db.select({ 
      count: sql`COUNT(*)` 
    }).from(cachedSuppliers);
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ SYNC COMPLETE!`);
    console.log(`📊 Total suppliers loaded: ${finalCount[0].count}`);
    console.log(`📊 Expected: ${rows.length}`);
    console.log('='.repeat(60));
    
    // Show sample
    const sample = await db.select()
      .from(cachedSuppliers)
      .limit(5);
    
    console.log('\n📝 Sample suppliers:');
    for (const s of sample) {
      console.log(`  • ${s.payeeName} (${s.paymentType})`);
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

fastBigQuerySync();