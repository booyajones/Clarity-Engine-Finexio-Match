#!/usr/bin/env node

/**
 * Test Finexio V3 with Resource Management
 * Tests memory usage and processing speed with the optimized implementation
 */

import { db } from './server/db.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔬 Testing Finexio V3 with Resource Management...');

// Get a sample of payees to test
const testPayees = [
  { name: 'Microsoft Corporation', city: 'Redmond', state: 'WA' },
  { name: 'Apple Inc', city: 'Cupertino', state: 'CA' },
  { name: 'Amazon.com Inc', city: 'Seattle', state: 'WA' },
  { name: 'Google LLC', city: 'Mountain View', state: 'CA' },
  { name: 'Meta Platforms Inc', city: 'Menlo Park', state: 'CA' },
  { name: 'Walmart Inc', city: 'Bentonville', state: 'AR' },
  { name: 'Tesla Inc', city: 'Austin', state: 'TX' },
  { name: 'Johnson & Johnson', city: 'New Brunswick', state: 'NJ' },
  { name: 'JPMorgan Chase & Co', city: 'New York', state: 'NY' },
  { name: 'Bank of America Corp', city: 'Charlotte', state: 'NC' }
];

// Monitor memory usage
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024)
  };
}

async function testMatching() {
  console.log('\n📊 Initial Memory:', getMemoryUsage());
  
  // Test direct database query performance
  console.log('\n🔍 Testing database trigram search...');
  const startDb = Date.now();
  
  for (const payee of testPayees) {
    try {
      const result = await db.execute`
        SELECT 
          id,
          payee_name,
          similarity(LOWER(payee_name), ${payee.name.toLowerCase()}) as sim
        FROM cached_suppliers
        WHERE LOWER(payee_name) % ${payee.name.toLowerCase()}
        ORDER BY sim DESC
        LIMIT 5
      `;
      
      console.log(`  ✓ ${payee.name}: Found ${result.rows.length} candidates`);
      
      if (result.rows.length > 0) {
        const topMatch = result.rows[0];
        console.log(`    → Best match: "${topMatch.payee_name}" (similarity: ${Number(topMatch.sim).toFixed(3)})`);
      }
    } catch (error) {
      console.error(`  ✗ ${payee.name}: Error -`, error.message);
    }
  }
  
  const dbTime = Date.now() - startDb;
  console.log(`\n⏱️  Database search completed in ${dbTime}ms (${Math.round(testPayees.length * 1000 / dbTime)} queries/sec)`);
  
  // Check memory after database operations
  console.log('\n📊 Memory after DB operations:', getMemoryUsage());
  
  // Now test with the full V3 matcher
  console.log('\n🚀 Testing V3 Matcher with resource limits...');
  
  try {
    // Import the matcher
    const { FinexioMatcherV3 } = await import('./server/services/finexioMatcherV3.js');
    const matcher = new FinexioMatcherV3();
    
    const startMatcher = Date.now();
    let matched = 0;
    
    for (const payee of testPayees) {
      const result = await matcher.match(payee.name, {
        city: payee.city,
        state: payee.state
      });
      
      if (result.matched) {
        matched++;
        console.log(`  ✓ ${payee.name}: Matched via ${result.method} (confidence: ${result.confidence.toFixed(2)})`);
      } else {
        console.log(`  ✗ ${payee.name}: No match (confidence: ${result.confidence.toFixed(2)})`);
      }
    }
    
    const matcherTime = Date.now() - startMatcher;
    console.log(`\n⏱️  V3 Matcher completed in ${matcherTime}ms (${Math.round(testPayees.length * 1000 / matcherTime)} matches/sec)`);
    console.log(`📈 Match rate: ${matched}/${testPayees.length} (${Math.round(matched * 100 / testPayees.length)}%)`);
    
  } catch (error) {
    console.error('Error testing V3 matcher:', error);
  }
  
  // Final memory check
  console.log('\n📊 Final Memory:', getMemoryUsage());
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('📊 Memory after GC:', getMemoryUsage());
  }
}

// Run the test
testMatching()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });