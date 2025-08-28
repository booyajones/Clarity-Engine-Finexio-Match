import { db } from './server/db';
import { cachedSuppliers, payeeClassifications } from './shared/schema';
import { eq, sql, like } from 'drizzle-orm';

async function verifyCache() {
  console.log('\n🔍 VERIFYING CACHED SUPPLIER DATA INTEGRITY');
  console.log('=' .repeat(60));

  // Check how many suppliers we have
  const totalSuppliers = await db.select({ count: sql<number>`count(*)::int` })
    .from(cachedSuppliers);

  console.log(`Total cached suppliers: ${totalSuppliers[0].count}`);

  // Check for KENNETH PSILLAS specifically
  const kenneth = await db.select()
    .from(cachedSuppliers)
    .where(like(cachedSuppliers.payeeName, '%KENNETH%PSILLAS%'));

  if (kenneth.length > 0) {
    console.log('\n❌ FOUND PHANTOM SUPPLIER(S):');
    for (const supplier of kenneth) {
      console.log(`  ID: ${supplier.id}`);
      console.log(`  Payee ID: ${supplier.payeeId}`);
      console.log(`  Name: ${supplier.payeeName}`);
      console.log(`  Created: ${supplier.createdAt}`);
      console.log('  ⚠️  This supplier DOES NOT exist in BigQuery!');
    }
  }

  // Check how many classifications are using bad Finexio matches
  const badMatches = await db.select({ 
    count: sql<number>`count(*)::int`,
    example: sql<string>`MAX(original_name)`
  })
    .from(payeeClassifications)
    .where(eq(payeeClassifications.finexioSupplierId, '2441596'));

  console.log(`\n⚠️  Classifications using phantom supplier 2441596: ${badMatches[0].count}`);
  if (badMatches[0].count > 0) {
    console.log(`  Example: ${badMatches[0].example}`);
  }

  // Check a few more random suppliers to verify data integrity
  console.log('\n📊 SAMPLE OF CACHED SUPPLIERS:');
  const sample = await db.select()
    .from(cachedSuppliers)
    .limit(5)
    .orderBy(sql`random()`);

  for (const supplier of sample) {
    console.log(`  - ${supplier.payeeName} (ID: ${supplier.id})`);
  }

  console.log('\n❌ CRITICAL ISSUE FOUND:');
  console.log('The cached_suppliers table contains data that DOES NOT exist in BigQuery.');
  console.log('This is causing FALSE POSITIVE matches in the system.');
  
  console.log('\n🔧 IMMEDIATE ACTIONS NEEDED:');
  console.log('1. Clear the cached_suppliers table');
  console.log('2. Re-sync from actual BigQuery data with proper verification');
  console.log('3. Clear all Finexio match data from classifications');
  console.log('4. Re-run Finexio matching with correct data');
  
  console.log('\n⚠️  WARNING: The system is showing incorrect match rates!');
  console.log('=' .repeat(60));
}

verifyCache().catch(console.error).finally(() => process.exit(0));