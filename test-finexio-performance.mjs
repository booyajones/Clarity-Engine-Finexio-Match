#!/usr/bin/env node

/**
 * Test Finexio Performance with Optimized Indexes
 * This test verifies the performance improvements from trigram indexes
 */

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 Testing Finexio Performance with Optimized Indexes...\n');

// Test payees for benchmark
const testPayees = [
  'Microsoft Corporation',
  'Apple Inc',
  'Amazon.com Inc',
  'Google LLC',
  'Walmart Inc',
  'Bank of America Corp',
  'JPMorgan Chase',
  'Tesla Inc',
  'Meta Platforms',
  'Johnson & Johnson'
];

async function testQueryPerformance() {
  console.log('📊 Testing Query Performance...\n');
  
  // Test 1: Old LIKE pattern (what we were doing before)
  console.log('❌ OLD METHOD: LIKE with wildcards (slow)');
  const startOld = Date.now();
  
  for (const payee of testPayees.slice(0, 3)) {
    const searchTerm = payee.toLowerCase();
    const oldQuery = sql`
      SELECT id, payee_name 
      FROM cached_suppliers
      WHERE LOWER(payee_name) LIKE ${'%' + searchTerm + '%'}
      LIMIT 5
    `;
    
    const startQuery = Date.now();
    await db.execute(oldQuery);
    const queryTime = Date.now() - startQuery;
    console.log(`  ${payee}: ${queryTime}ms`);
  }
  
  const oldTime = Date.now() - startOld;
  console.log(`  Total: ${oldTime}ms for 3 queries\n`);
  
  // Test 2: New trigram similarity (with our new indexes)
  console.log('✅ NEW METHOD: Trigram similarity with indexes (fast)');
  const startNew = Date.now();
  
  for (const payee of testPayees) {
    const searchTerm = payee.toLowerCase();
    const newQuery = sql`
      SELECT 
        id, 
        payee_name,
        GREATEST(
          similarity(lower(payee_name), ${searchTerm}),
          similarity(lower(COALESCE(normalized_name, '')), ${searchTerm}),
          similarity(lower(COALESCE(mastercard_business_name, '')), ${searchTerm})
        ) as sim
      FROM cached_suppliers
      WHERE 
        lower(payee_name) % ${searchTerm}
        OR lower(COALESCE(normalized_name, '')) % ${searchTerm}
        OR lower(COALESCE(mastercard_business_name, '')) % ${searchTerm}
      ORDER BY sim DESC
      LIMIT 5
    `;
    
    const startQuery = Date.now();
    const results = await db.execute(newQuery);
    const queryTime = Date.now() - startQuery;
    
    const topMatch = results.rows[0];
    if (topMatch) {
      console.log(`  ${payee}: ${queryTime}ms → "${topMatch.payee_name}" (${Number(topMatch.sim).toFixed(3)} similarity)`);
    } else {
      console.log(`  ${payee}: ${queryTime}ms → No match`);
    }
  }
  
  const newTime = Date.now() - startNew;
  console.log(`  Total: ${newTime}ms for ${testPayees.length} queries`);
  console.log(`  Average: ${Math.round(newTime / testPayees.length)}ms per query\n`);
  
  // Calculate improvement
  const avgOld = Math.round(oldTime / 3);
  const avgNew = Math.round(newTime / testPayees.length);
  const improvement = Math.round((avgOld - avgNew) / avgOld * 100);
  
  console.log('📈 PERFORMANCE IMPROVEMENT:');
  console.log(`  Old method: ~${avgOld}ms per query`);
  console.log(`  New method: ~${avgNew}ms per query`);
  console.log(`  Speed improvement: ${improvement}% faster\n`);
}

async function testBatchPerformance() {
  console.log('🔬 Testing Batch Processing Performance...\n');
  
  // Generate 100 test payee names with variations
  const batchPayees = [];
  const baseNames = ['Microsoft', 'Apple', 'Amazon', 'Google', 'Tesla'];
  
  for (let i = 0; i < 100; i++) {
    const base = baseNames[i % baseNames.length];
    const variation = i % 10;
    let name = base;
    
    // Add variations to test fuzzy matching
    switch (variation) {
      case 1: name = base + ' Inc'; break;
      case 2: name = base + ' Corporation'; break;
      case 3: name = base + ' LLC'; break;
      case 4: name = base.toLowerCase(); break;
      case 5: name = base.toUpperCase(); break;
      case 6: name = base + ' Co'; break;
      case 7: name = base.substring(0, base.length - 1); break; // Typo
      case 8: name = base + ' Corp.'; break;
      case 9: name = base + ' Company'; break;
    }
    
    batchPayees.push(name);
  }
  
  // Test with V3 matcher
  try {
    const { FinexioMatcherV3 } = await import('./server/services/finexioMatcherV3.js');
    const matcher = new FinexioMatcherV3();
    
    console.log(`Processing ${batchPayees.length} payees with V3 matcher...`);
    const startBatch = Date.now();
    
    const results = await matcher.matchBatch(
      batchPayees.map((name, idx) => ({ 
        id: String(idx), 
        payeeName: name 
      }))
    );
    
    const batchTime = Date.now() - startBatch;
    const matchedCount = Array.from(results.values()).filter(r => r.matched).length;
    const recordsPerSecond = Math.round((batchPayees.length / batchTime) * 1000);
    
    console.log(`\n✅ Batch Results:`);
    console.log(`  Total time: ${batchTime}ms`);
    console.log(`  Records processed: ${batchPayees.length}`);
    console.log(`  Matches found: ${matchedCount} (${Math.round(matchedCount * 100 / batchPayees.length)}%)`);
    console.log(`  Performance: ${recordsPerSecond} records/second`);
    console.log(`  Average: ${Math.round(batchTime / batchPayees.length)}ms per record\n`);
    
    // Show sample results
    console.log('Sample matches:');
    let samples = 0;
    for (const [id, result] of results) {
      if (result.matched && samples < 5) {
        const idx = parseInt(id);
        console.log(`  "${batchPayees[idx]}" → Matched via ${result.method} (${result.confidence.toFixed(2)} confidence)`);
        samples++;
      }
    }
  } catch (error) {
    console.error('Error testing batch performance:', error);
  }
}

// Run tests
testQueryPerformance()
  .then(() => testBatchPerformance())
  .then(() => {
    console.log('\n🎯 Performance test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });