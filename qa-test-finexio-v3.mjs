#!/usr/bin/env node
/**
 * Comprehensive QA Test for Finexio V3 Matcher
 * Tests the new streamlined DB→Rules→AI pipeline
 */

import { db, sql } from './server/db.js';
import { finexioMatcherV3 } from './server/services/finexioMatcherV3.js';
import { cachedSuppliers, payeeClassifications, uploadBatches } from './shared/schema.js';
import { eq } from 'drizzle-orm';

// Test data with various matching scenarios
const testCases = [
  {
    name: "Amazon.com Inc",
    expected: { type: "exact", confidence: 1.0 },
    description: "Exact match test"
  },
  {
    name: "AMAZON COM",
    expected: { type: "exact_or_early", minConfidence: 0.95 },
    description: "Normalized exact match"
  },
  {
    name: "Microsoft Corporation",
    expected: { type: "high_confidence", minConfidence: 0.9 },
    description: "High confidence match"
  },
  {
    name: "Amazone", // Typo
    expected: { type: "fuzzy", minConfidence: 0.7 },
    description: "Typo handling"
  },
  {
    name: "Wal-Mart Stores Inc",
    expected: { type: "variation", minConfidence: 0.85 },
    description: "Name variation handling"
  },
  {
    name: "NonExistentCompany12345",
    expected: { type: "no_match", confidence: 0 },
    description: "No match scenario"
  }
];

async function runQATests() {
  console.log("\n🔬 Starting Finexio V3 Matcher QA Tests");
  console.log("=" .repeat(60));
  
  let passed = 0;
  let failed = 0;
  const results = [];

  // Test 1: Performance Test
  console.log("\n📊 Test 1: Performance Benchmark");
  console.log("-".repeat(40));
  
  const perfStart = Date.now();
  const batchItems = [];
  
  // Create batch of 100 test items
  for (let i = 0; i < 100; i++) {
    batchItems.push({
      id: `test-${i}`,
      payeeName: testCases[i % testCases.length].name,
      city: null,
      state: null
    });
  }
  
  const batchResults = await finexioMatcherV3.matchBatch(batchItems);
  const perfEnd = Date.now();
  const perfTime = perfEnd - perfStart;
  const recordsPerSecond = Math.round((100 * 1000) / perfTime);
  
  console.log(`✅ Processed 100 records in ${perfTime}ms (${recordsPerSecond} records/sec)`);
  
  if (recordsPerSecond > 50) {
    console.log(`🎉 Performance EXCELLENT: ${recordsPerSecond} records/sec (target: >50)`);
    passed++;
  } else if (recordsPerSecond > 20) {
    console.log(`✅ Performance GOOD: ${recordsPerSecond} records/sec (target: >20)`);
    passed++;
  } else {
    console.log(`⚠️ Performance NEEDS IMPROVEMENT: ${recordsPerSecond} records/sec`);
    failed++;
  }

  // Test 2: Accuracy Tests
  console.log("\n🎯 Test 2: Matching Accuracy");
  console.log("-".repeat(40));
  
  for (const testCase of testCases) {
    const result = await finexioMatcherV3.match(testCase.name);
    
    let testPassed = false;
    let message = "";
    
    if (testCase.expected.type === "exact") {
      testPassed = result.method === 'exact' && result.confidence === 1.0;
      message = `Method: ${result.method}, Confidence: ${result.confidence}`;
    } else if (testCase.expected.type === "exact_or_early") {
      testPassed = (result.method === 'exact' || result.method === 'early_accept') && 
                   result.confidence >= testCase.expected.minConfidence;
      message = `Method: ${result.method}, Confidence: ${result.confidence}`;
    } else if (testCase.expected.type === "no_match") {
      testPassed = !result.matched;
      message = `Matched: ${result.matched}`;
    } else {
      testPassed = result.confidence >= (testCase.expected.minConfidence || 0);
      message = `Confidence: ${result.confidence} (min: ${testCase.expected.minConfidence})`;
    }
    
    if (testPassed) {
      console.log(`✅ ${testCase.description}: PASSED - ${message}`);
      passed++;
    } else {
      console.log(`❌ ${testCase.description}: FAILED - ${message}`);
      failed++;
    }
    
    results.push({
      test: testCase.description,
      input: testCase.name,
      passed: testPassed,
      result: result
    });
  }

  // Test 3: Cancel Functionality
  console.log("\n🛑 Test 3: Cancel Job Functionality");
  console.log("-".repeat(40));
  
  try {
    // Create a test batch
    const testBatch = await db.insert(uploadBatches)
      .values({
        filename: "QA_Test_Batch",
        originalFilename: "qa-test.csv",
        status: "processing",
        totalRecords: 100,
        processedRecords: 50,
        userId: 1
      })
      .returning();
    
    const batchId = testBatch[0].id;
    console.log(`Created test batch ID: ${batchId}`);
    
    // Test cancel endpoint
    const response = await fetch(`http://localhost:5000/api/upload/batches/${batchId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response.ok) {
      // Verify batch was cancelled
      const updatedBatch = await db.query.uploadBatches.findFirst({
        where: eq(uploadBatches.id, batchId)
      });
      
      if (updatedBatch?.status === 'cancelled') {
        console.log(`✅ Cancel functionality: PASSED - Batch ${batchId} cancelled successfully`);
        passed++;
      } else {
        console.log(`❌ Cancel functionality: FAILED - Batch status is ${updatedBatch?.status}`);
        failed++;
      }
    } else {
      console.log(`❌ Cancel functionality: FAILED - HTTP ${response.status}`);
      failed++;
    }
    
    // Clean up test batch
    await db.delete(uploadBatches).where(eq(uploadBatches.id, batchId));
    
  } catch (error) {
    console.log(`❌ Cancel functionality: ERROR - ${error.message}`);
    failed++;
  }

  // Test 4: Memory Usage
  console.log("\n💾 Test 4: Memory Usage");
  console.log("-".repeat(40));
  
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  console.log(`Heap Used: ${heapUsedMB} MB`);
  if (heapUsedMB < 200) {
    console.log(`✅ Memory usage EXCELLENT: ${heapUsedMB}MB < 200MB`);
    passed++;
  } else if (heapUsedMB < 500) {
    console.log(`⚠️ Memory usage ACCEPTABLE: ${heapUsedMB}MB < 500MB`);
    passed++;
  } else {
    console.log(`❌ Memory usage HIGH: ${heapUsedMB}MB > 500MB`);
    failed++;
  }

  // Test 5: Database Indexes
  console.log("\n🗄️ Test 5: Database Indexes Verification");
  console.log("-".repeat(40));
  
  try {
    // Check if trigram indexes exist
    const indexCheck = await db.execute(sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'cached_suppliers' 
      AND indexname LIKE '%trgm%'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log(`✅ Trigram indexes found: ${indexCheck.rows.length} indexes`);
      passed++;
    } else {
      console.log(`⚠️ No trigram indexes found - performance may be degraded`);
      console.log(`Run: CREATE INDEX idx_suppliers_name_trgm ON cached_suppliers USING GIN (LOWER(payee_name) gin_trgm_ops);`);
      failed++;
    }
  } catch (error) {
    console.log(`⚠️ Could not verify indexes: ${error.message}`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📈 QA TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED! System is production ready.");
  } else {
    console.log("\n⚠️ Some tests failed. Please review and fix issues.");
  }
  
  // Export detailed results
  const reportPath = './qa-report-finexio-v3.json';
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      passed,
      failed,
      total: passed + failed,
      successRate: `${Math.round((passed / (passed + failed)) * 100)}%`
    },
    performance: {
      recordsPerSecond,
      processingTimeMs: perfTime
    },
    memoryUsageMB: heapUsedMB,
    detailedResults: results
  };
  
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
console.log("🚀 Finexio V3 QA Test Suite");
console.log("Testing streamlined DB→Rules→AI pipeline");

runQATests().catch(error => {
  console.error("❌ Test suite failed:", error);
  process.exit(1);
});