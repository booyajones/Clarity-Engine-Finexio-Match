
import dotenv from 'dotenv';
dotenv.config();

// Show current config
console.log('Current project:', process.env.BIGQUERY_PROJECT_ID);

// Set the correct configuration
process.env.BIGQUERY_PROJECT_ID = 'finexiopoc';
process.env.BIGQUERY_DATASET = 'SE_Enrichment';
process.env.BIGQUERY_TABLE = 'supplier';

console.log('Updated to:', process.env.BIGQUERY_PROJECT_ID);
console.log('Dataset:', process.env.BIGQUERY_DATASET);
console.log('Table:', process.env.BIGQUERY_TABLE);

