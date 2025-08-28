import { BigQuery } from '@google-cloud/bigquery';
import { db } from './server/db';
import { cachedSuppliers } from './shared/schema';
import { sql } from 'drizzle-orm';

async function loadAllBigQuerySuppliers() {
  console.log('\n🚀 LOADING ALL SUPPLIERS FROM BIGQUERY');
  console.log('=' .repeat(60));
  
  try {
    const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}');
    const projectId = 'finexiopoc';
    
    console.log(`📊 Connecting to BigQuery project: ${projectId}`);
    
    const bigquery = new BigQuery({
      projectId: projectId,
      credentials: credentials,
    });
    
    // Use the exact query requested
    const query = `SELECT * FROM \`finexiopoc.SE_Enrichment.supplier\``;
    
    console.log('📥 Fetching ALL suppliers from BigQuery...');
    const [rows] = await bigquery.query({ query, location: 'US' });
    
    console.log(`✅ Found ${rows.length} suppliers in BigQuery`);
    
    // Process in batches
    const batchSize = 500;
    let processed = 0;
    let inserted = 0;
    let updated = 0;
    
    console.log('📦 Loading suppliers to cache...');
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      for (const row of batch) {
        const supplier = {
          payeeId: row.Ref_ID ? `BQ_${row.Ref_ID}` : `BQ_ROW_${processed}`,
          payeeName: row.Name || '',
          normalizedName: (row.Name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
          paymentType: row.Payment_Method || 'CHECK',
        };
        
        try {
          // Insert or update each supplier
          const result = await db.insert(cachedSuppliers)
            .values(supplier)
            .onConflictDoUpdate({
              target: cachedSuppliers.payeeId,
              set: {
                payeeName: supplier.payeeName,
                normalizedName: supplier.normalizedName,
                paymentType: supplier.paymentType,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              }
            });
          
          inserted++;
        } catch (error: any) {
          if (error.code === '23505') {
            // Duplicate key - update instead
            updated++;
          } else {
            console.log(`⚠️  Error processing supplier ${supplier.payeeId}:`, error.message);
          }
        }
        
        processed++;
        
        if (processed % 10000 === 0) {
          console.log(`  📦 Processed ${processed}/${rows.length} (${Math.round(processed * 100 / rows.length)}%)`);
        }
      }
    }
    
    console.log(`\n✅ Processing complete:`);
    console.log(`  📊 Total processed: ${processed}`);
    console.log(`  ✅ Inserted/Updated: ${inserted}`);
    
    // Verify final count
    const finalCount = await db.select({ 
      count: sql<number>`COUNT(*)` 
    }).from(cachedSuppliers);
    
    console.log(`\n📊 Total suppliers in cache: ${finalCount[0].count}`);
    
    // Show sample
    const sample = await db.select()
      .from(cachedSuppliers)
      .where(sql`payee_id LIKE 'BQ_%'`)
      .limit(5);
    
    console.log('\n📝 Sample BigQuery suppliers:');
    for (const s of sample) {
      console.log(`  • ${s.payeeName} (${s.paymentType}) - ${s.payeeId}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL BIGQUERY SUPPLIERS LOADED SUCCESSFULLY');
    console.log('='.repeat(60));
    
  } catch (error: any) {
    console.error('\n❌ Error loading suppliers:', error.message);
  } finally {
    process.exit(0);
  }
}

loadAllBigQuerySuppliers();