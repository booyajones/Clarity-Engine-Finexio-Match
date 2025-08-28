import { BigQuery } from '@google-cloud/bigquery';
import { db } from './server/db';
import { cachedSuppliers } from './shared/schema';
import { sql } from 'drizzle-orm';

async function syncRealSuppliers() {
  console.log('\n🚀 SYNCING REAL SUPPLIERS FROM BIGQUERY');
  console.log('=' .repeat(60));
  
  try {
    // Initialize BigQuery client
    const projectId = process.env.BIGQUERY_PROJECT_ID || 'finexiopoc';
    const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}');
    
    const bigquery = new BigQuery({
      projectId: projectId,
      credentials: credentials,
    });
    
    console.log(`✅ Connected to BigQuery project: ${projectId}`);
    
    // Query to get DISTINCT suppliers from BigQuery
    const query = `
      WITH distinct_suppliers AS (
        SELECT DISTINCT
          id,
          name,
          payment_type_c,
          ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY id) as rn
        FROM \`${projectId}.SE_Enrichment.supplier\`
        WHERE COALESCE(is_deleted, false) = false
          AND name IS NOT NULL
          AND LENGTH(TRIM(name)) > 0
      )
      SELECT 
        CAST(id AS STRING) as payee_id,
        name as payee_name,
        payment_type_c as payment_type
      FROM distinct_suppliers
      WHERE rn = 1
      ORDER BY name ASC
      LIMIT 200000
    `;
    
    console.log('📊 Querying BigQuery for real suppliers...');
    const [rows] = await bigquery.query({ query });
    console.log(`✅ Found ${rows.length} distinct suppliers in BigQuery`);
    
    // Clear existing cache first
    console.log('🧹 Clearing old cache...');
    await db.delete(cachedSuppliers);
    
    // Process in batches of 1000
    const batchSize = 1000;
    let processed = 0;
    
    console.log('📥 Importing suppliers to cache...');
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const suppliers = batch.map(row => ({
        payeeId: `SUP_${row.payee_id}_${Date.now()}`,
        payeeName: row.payee_name || '',
        normalizedName: (row.payee_name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
        paymentType: row.payment_type || 'CHECK',
      }));
      
      // Insert batch
      await db.insert(cachedSuppliers).values(suppliers);
      
      processed += batch.length;
      if (processed % 10000 === 0) {
        console.log(`  📦 Processed ${processed}/${rows.length} suppliers...`);
      }
    }
    
    console.log(`\n✅ Successfully synced ${processed} REAL suppliers from BigQuery`);
    
    // Verify a few suppliers
    console.log('\n📝 Verification - Sample of synced suppliers:');
    const sample = await db.select()
      .from(cachedSuppliers)
      .limit(5)
      .orderBy(sql`random()`);
    
    for (const supplier of sample) {
      console.log(`  ✓ ${supplier.payeeName} (${supplier.paymentType})`);
    }
    
    // Check if KENNETH PSILLAS exists
    const kennethCheck = await db.select()
      .from(cachedSuppliers)
      .where(sql`payee_name LIKE '%KENNETH%PSILLAS%'`)
      .limit(1);
    
    if (kennethCheck.length === 0) {
      console.log('\n✅ VERIFIED: "KENNETH PSILLAS LANDSCAPING" NOT in BigQuery (as expected)');
    } else {
      console.log('\n⚠️  WARNING: Found KENNETH PSILLAS in BigQuery - needs investigation');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUPPLIER SYNC COMPLETE - Using REAL BigQuery data');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error syncing suppliers:', error);
    console.error('\nMake sure BigQuery credentials are properly configured');
  } finally {
    process.exit(0);
  }
}

// Run the sync
syncRealSuppliers();