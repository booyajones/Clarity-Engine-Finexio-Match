import { BigQuery } from '@google-cloud/bigquery';

async function checkTableSchema() {
  console.log('\n📊 CHECKING BIGQUERY TABLE SCHEMA');
  console.log('=' .repeat(60));
  
  try {
    const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS || '{}');
    const projectId = 'finexiopoc';
    
    console.log(`📊 Connecting to BigQuery project: ${projectId}`);
    
    const bigquery = new BigQuery({
      projectId: projectId,
      credentials: credentials,
    });
    
    // First, let's get the table schema
    const dataset = bigquery.dataset('SE_Enrichment');
    const table = dataset.table('supplier');
    
    console.log('📋 Getting table metadata...');
    const [metadata] = await table.getMetadata();
    
    console.log('\n📊 Table Schema:');
    console.log('Columns in finexiopoc.SE_Enrichment.supplier:');
    console.log('-'.repeat(60));
    
    if (metadata.schema && metadata.schema.fields) {
      metadata.schema.fields.forEach((field: any) => {
        console.log(`  • ${field.name} (${field.type})`);
      });
    }
    
    // Now let's get a sample of data to see what's actually there
    console.log('\n📝 Getting sample data...');
    const query = `
      SELECT *
      FROM \`finexiopoc.SE_Enrichment.supplier\`
      LIMIT 5
    `;
    
    const [rows] = await bigquery.query({ query, location: 'US' });
    
    console.log(`\n✅ Found ${rows.length} sample rows`);
    console.log('\nSample data:');
    console.log('-'.repeat(60));
    
    if (rows.length > 0) {
      console.log('Available columns:', Object.keys(rows[0]));
      console.log('\nFirst row data:');
      Object.entries(rows[0]).forEach(([key, value]) => {
        const displayValue = value === null ? 'null' : 
                            typeof value === 'string' && value.length > 50 ? 
                            value.substring(0, 50) + '...' : value;
        console.log(`  ${key}: ${displayValue}`);
      });
    }
    
    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM \`finexiopoc.SE_Enrichment.supplier\`
    `;
    
    const [countResult] = await bigquery.query({ query: countQuery, location: 'US' });
    console.log(`\n📊 Total records in table: ${countResult[0].total}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ TABLE SCHEMA CHECK COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error: any) {
    console.error('\n❌ Error checking table schema:', error);
    console.error('Error details:', error.message);
  } finally {
    process.exit(0);
  }
}

checkTableSchema();