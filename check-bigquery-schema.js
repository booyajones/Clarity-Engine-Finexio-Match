import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

async function checkTableSchema() {
  console.log('🔍 CHECKING BIGQUERY TABLE SCHEMA...');
  console.log('================================================');
  
  try {
    // Initialize BigQuery with FinexioPOC project
    const bigquery = new BigQuery({
      projectId: 'finexiopoc',
      credentials: JSON.parse(process.env.BIGQUERY_CREDENTIALS)
    });
    
    const dataset = 'SE_Enrichment';
    const table = 'supplier';
    
    console.log(`📊 Project: finexiopoc`);
    console.log(`📁 Dataset: ${dataset}`);
    console.log(`📋 Table: ${table}`);
    console.log('');
    
    // Get table metadata
    const [metadata] = await bigquery
      .dataset(dataset)
      .table(table)
      .getMetadata();
    
    console.log('✅ Table found! Schema details:');
    console.log('');
    console.log('COLUMNS:');
    console.log('--------');
    
    metadata.schema.fields.forEach((field, index) => {
      console.log(`${index + 1}. ${field.name} (${field.type})`);
    });
    
    // Try a simple query to get sample data
    console.log('\n📥 Fetching sample data...');
    const sampleQuery = `
      SELECT *
      FROM \`finexiopoc.${dataset}.${table}\`
      LIMIT 5
    `;
    
    const [rows] = await bigquery.query({ query: sampleQuery });
    
    console.log(`\n✅ Found ${rows.length} sample records`);
    console.log('\nSample record structure:');
    if (rows.length > 0) {
      const sampleRecord = rows[0];
      Object.keys(sampleRecord).forEach(key => {
        const value = sampleRecord[key];
        const displayValue = value ? 
          (typeof value === 'string' ? value.substring(0, 50) : value) : 
          'null';
        console.log(`  ${key}: ${displayValue}`);
      });
    }
    
    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM \`finexiopoc.${dataset}.${table}\`
    `;
    
    const [countResult] = await bigquery.query({ query: countQuery });
    console.log(`\n📊 Total records in table: ${countResult[0].total}`);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.errors) {
      error.errors.forEach(e => console.error('  -', e.message));
    }
  }
}

// Run the check
checkTableSchema().then(() => {
  console.log('\n✨ Schema check complete!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});