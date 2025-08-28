import { BigQuery } from '@google-cloud/bigquery';

async function checkBigQuerySchema() {
  try {
    const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}');
    const bigquery = new BigQuery({
      projectId: 'finexiopoc',
      credentials: credentials,
    });
    
    console.log('🔍 Checking BigQuery table schema...\n');
    
    // Get table schema
    const [metadata] = await bigquery
      .dataset('SE_Enrichment')
      .table('supplier')
      .getMetadata();
    
    console.log('📊 Table columns:');
    metadata.schema.fields.forEach(field => {
      console.log(`  • ${field.name} (${field.type})`);
    });
    
    // Now get a sample row to see actual data
    const query = `SELECT * FROM \`finexiopoc.SE_Enrichment.supplier\` WHERE UPPER(Supplier_Name) LIKE '%MICROSOFT%' LIMIT 5`;
    
    console.log('\n🔍 Looking for Microsoft in BigQuery...');
    const [rows] = await bigquery.query({ query, location: 'US' });
    
    if (rows.length > 0) {
      console.log(`✅ Found ${rows.length} Microsoft entries:`);
      rows.forEach(row => {
        console.log('\nRow data:');
        Object.keys(row).forEach(key => {
          if (row[key]) {
            console.log(`  ${key}: ${row[key]}`);
          }
        });
      });
    } else {
      // Try without filter to see what columns have data
      const sampleQuery = `SELECT * FROM \`finexiopoc.SE_Enrichment.supplier\` LIMIT 3`;
      const [sampleRows] = await bigquery.query({ query: sampleQuery, location: 'US' });
      
      console.log('\n📝 Sample data (3 rows):');
      sampleRows.forEach((row, idx) => {
        console.log(`\nRow ${idx + 1}:`);
        Object.keys(row).forEach(key => {
          if (row[key]) {
            console.log(`  ${key}: ${row[key]}`);
          }
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkBigQuerySchema();