import { BigQuery } from '@google-cloud/bigquery';
import { db } from './server/db';
import { cachedSuppliers } from './shared/schema';

async function syncAllBQSuppliers() {
  console.log('\n🚀 SYNCING ALL SUPPLIERS FROM BIGQUERY');
  console.log('=' .repeat(60));
  
  try {
    // Initialize BigQuery with the credentials from environment
    const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}');
    // Use finexiopoc project where the table exists
    const projectId = 'finexiopoc';
    
    console.log(`📊 Connecting to BigQuery project: ${projectId}`);
    console.log(`📊 Using credentials for access`);
    
    const bigquery = new BigQuery({
      projectId: projectId,
      credentials: credentials,
    });
    
    // Query ALL suppliers from the finexiopoc project - exact query as requested
    const query = `
      SELECT *
      FROM \`finexiopoc.SE_Enrichment.supplier\`
    `;
    
    console.log('📥 Querying ALL suppliers from finexiopoc.SE_Enrichment.supplier...');
    
    const options = {
      query: query,
      location: 'US',
    };
    
    const [rows] = await bigquery.query(options);
    
    console.log(`✅ Found ${rows.length} suppliers in BigQuery`);
    
    if (rows.length === 0) {
      console.log('⚠️  No suppliers found in BigQuery table');
      return;
    }
    
    // Clear existing cache
    console.log('🧹 Clearing old cache...');
    await db.delete(cachedSuppliers);
    
    // Process in batches to avoid memory issues
    const batchSize = 1000;
    let processed = 0;
    
    console.log('📦 Importing suppliers to cache...');
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const suppliers = batch.map((row, index) => ({
        payeeId: row.Ref_ID ? `BQ_${row.Ref_ID}` : `BQ_ROW_${i + index}`,
        payeeName: row.Name || '',
        normalizedName: (row.Name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
        paymentType: row.Payment_Method || 'CHECK',
      }));
      
      // Use onConflictDoNothing to skip duplicates
      await db.insert(cachedSuppliers)
        .values(suppliers)
        .onConflictDoNothing();
      
      processed += batch.length;
      if (processed % 10000 === 0 || processed === rows.length) {
        console.log(`  📦 Processed ${processed}/${rows.length} suppliers (${Math.round(processed * 100 / rows.length)}%)`);
      }
    }
    
    // Verify the sync
    const countResult = await db.select()
      .from(cachedSuppliers);
    
    console.log(`\n✅ Successfully synced ${processed} suppliers from BigQuery`);
    console.log(`📊 Total suppliers in cache: ${countResult.length}`);
    
    // Show a sample of synced suppliers
    console.log('\n📝 Sample of synced suppliers:');
    const sample = await db.select()
      .from(cachedSuppliers)
      .limit(10)
      .orderBy(cachedSuppliers.payeeName);
    
    for (const supplier of sample) {
      console.log(`  ✓ ${supplier.payeeName} (${supplier.paymentType})`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL BIGQUERY SUPPLIERS SYNCED SUCCESSFULLY');
    console.log('='.repeat(60));
    
  } catch (error: any) {
    console.error('\n❌ Error syncing suppliers:', error);
    console.error('Error details:', error.message);
    
    if (error.message?.includes('permission')) {
      console.log('\n💡 Permission issue detected. Make sure the service account has:');
      console.log('   - bigquery.jobs.create permission');
      console.log('   - bigquery.tables.getData permission');
      console.log('   - Access to finexiopoc.SE_Enrichment.supplier table');
    }
  } finally {
    process.exit(0);
  }
}

// Run the sync
syncAllBQSuppliers();