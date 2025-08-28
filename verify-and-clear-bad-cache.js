import { db } from './server/db.js';
import { cachedSuppliers, payeeClassifications } from './shared/schema.js';
import { eq, sql } from 'drizzle-orm';

console.log('\n🔍 VERIFYING CACHED SUPPLIER DATA INTEGRITY');
console.log('=' .repeat(60));

// Check how many suppliers we have
const totalSuppliers = await db.select({ count: sql`count(*)` })
  .from(cachedSuppliers);

console.log(`Total cached suppliers: ${totalSuppliers[0].count}`);

// Check for KENNETH PSILLAS specifically
const kenneth = await db.select()
  .from(cachedSuppliers)
  .where(eq(cachedSuppliers.payeeName, 'KENNETH PSILLAS LANDSCAPING'));

if (kenneth.length > 0) {
  console.log('\n❌ FOUND PHANTOM SUPPLIER:');
  console.log(`  ID: ${kenneth[0].id}`);
  console.log(`  Payee ID: ${kenneth[0].payeeId}`);
  console.log(`  Name: ${kenneth[0].payeeName}`);
  console.log(`  Created: ${kenneth[0].createdAt}`);
  console.log('\n  This supplier DOES NOT exist in BigQuery!');
}

// Check how many classifications are using bad Finexio matches
const badMatches = await db.select({ 
  count: sql`count(*)`,
  example: sql`MAX(original_name)`
})
  .from(payeeClassifications)
  .where(eq(payeeClassifications.finexioSupplierId, '2441596'));

console.log(`\n⚠️  Classifications using phantom supplier 2441596: ${badMatches[0].count}`);
if (badMatches[0].count > 0) {
  console.log(`  Example: ${badMatches[0].example}`);
}

console.log('\n🔧 RECOMMENDED ACTIONS:');
console.log('1. Clear the cached_suppliers table');
console.log('2. Re-sync from actual BigQuery data');
console.log('3. Clear Finexio match data from classifications');
console.log('4. Re-run Finexio matching with correct data');

// Ask for confirmation
console.log('\n⚠️  READY TO CLEAR BAD DATA?');
console.log('This will:');
console.log('  - Delete all cached suppliers');
console.log('  - Clear Finexio match data from classifications');
console.log('\nType "yes" to proceed or Ctrl+C to cancel');

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Proceed? ', async (answer) => {
  if (answer.toLowerCase() === 'yes') {
    console.log('\n🧹 CLEARING BAD DATA...');
    
    // Clear cached suppliers
    const deleted = await db.delete(cachedSuppliers);
    console.log('✅ Cleared all cached suppliers');
    
    // Clear Finexio match data
    const updated = await db.update(payeeClassifications)
      .set({
        finexioSupplierId: null,
        finexioSupplierName: null,
        finexioConfidence: null,
        finexioMatchReasoning: null
      })
      .where(sql`finexio_supplier_id IS NOT NULL`);
    
    console.log('✅ Cleared Finexio match data from classifications');
    console.log('\n✅ BAD DATA CLEARED');
    console.log('Next steps:');
    console.log('1. Configure BigQuery credentials properly');
    console.log('2. Run supplier sync from actual BigQuery data');
  } else {
    console.log('Cancelled');
  }
  
  rl.close();
  process.exit(0);
});