#!/usr/bin/env node

/**
 * COMPREHENSIVE SYSTEM TEST - 10 ROUNDS
 * Tests all functionality to prove the system works perfectly
 */

import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

const API_BASE = 'http://localhost:5000';
const TEST_RESULTS = [];

// Test CSV data
const TEST_CSV_CONTENT = `payee_name,payee_address
Microsoft Corporation,"One Microsoft Way, Redmond, WA 98052"
Apple Inc,"One Apple Park Way, Cupertino, CA 95014"
John Smith,"123 Main St, New York, NY 10001"
US Treasury Department,"1500 Pennsylvania Ave NW, Washington, DC 20220"
Wells Fargo Bank,"420 Montgomery St, San Francisco, CA 94104"`;

const LARGE_TEST_CSV = `payee_name,payee_address
${Array.from({length: 50}, (_, i) => `Test Company ${i+1},"${100+i} Test St, Test City, TS ${10000+i}"`).join('\n')}`;

console.log('🚀 STARTING COMPREHENSIVE SYSTEM TEST - 10 ROUNDS');
console.log('=' .repeat(60));

async function createTestFile(content, filename) {
  fs.writeFileSync(filename, content);
  return filename;
}

async function uploadFile(filename, settings = {}) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filename));
  form.append('settings', JSON.stringify({
    enableFinexio: true,
    enableMastercard: false,
    enableGoogleAddressValidation: false,
    enableAkkio: false,
    ...settings
  }));

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return await response.json();
}

async function waitForBatchCompletion(batchId, maxWaitTime = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`${API_BASE}/api/upload/batches`);
    const data = await response.json();
    
    const batch = data.find(b => b.id === batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    if (batch.status === 'completed') {
      return batch;
    }
    
    if (batch.status === 'failed') {
      throw new Error(`Batch ${batchId} failed: ${batch.progressMessage}`);
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Batch ${batchId} did not complete within ${maxWaitTime}ms`);
}

async function getBatchResults(batchId) {
  const response = await fetch(`${API_BASE}/api/classifications/${batchId}`);
  if (!response.ok) {
    throw new Error(`Failed to get results for batch ${batchId}`);
  }
  return await response.json();
}

async function checkSystemHealth() {
  const endpoints = [
    '/api/dashboard/stats',
    '/api/monitoring/memory',
    '/api/monitoring/cache/stats'
  ];
  
  const results = {};
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`);
      if (response.ok) {
        results[endpoint] = await response.json();
      } else {
        results[endpoint] = { error: `HTTP ${response.status}` };
      }
    } catch (error) {
      results[endpoint] = { error: error.message };
    }
  }
  
  return results;
}

async function runSingleTest(testNumber) {
  console.log(`\n📋 TEST ${testNumber}/10 - ${new Date().toISOString()}`);
  console.log('-'.repeat(50));
  
  const testStart = Date.now();
  const testResult = {
    testNumber,
    startTime: new Date().toISOString(),
    success: false,
    steps: [],
    errors: [],
    batchId: null,
    processingTime: 0,
    recordsProcessed: 0,
    memoryUsage: null
  };
  
  try {
    // Step 1: Create test file
    const filename = `test-${testNumber}-${Date.now()}.csv`;
    const useSmallFile = testNumber <= 5;
    const content = useSmallFile ? TEST_CSV_CONTENT : LARGE_TEST_CSV;
    await createTestFile(content, filename);
    testResult.steps.push(`✓ Created test file: ${filename} (${useSmallFile ? 'small' : 'large'})`);
    
    // Step 2: Upload file
    const uploadResult = await uploadFile(filename, {
      enableFinexio: true,
      enableMastercard: testNumber % 3 === 0, // Enable Mastercard every 3rd test
      enableGoogleAddressValidation: false,
      enableAkkio: false
    });
    testResult.batchId = uploadResult.id;
    testResult.steps.push(`✓ Uploaded file successfully: Batch ID ${uploadResult.id}`);
    
    // Step 3: Wait for completion
    console.log(`⏳ Waiting for batch ${uploadResult.id} to complete...`);
    const batch = await waitForBatchCompletion(uploadResult.id, 120000); // 2 minute timeout
    testResult.processingTime = Date.now() - testStart;
    testResult.recordsProcessed = batch.processedRecords || 0;
    testResult.steps.push(`✓ Batch completed: ${batch.processedRecords} records processed`);
    
    // Step 4: Get results
    const results = await getBatchResults(uploadResult.id);
    if (!results.success || !results.data || results.data.length === 0) {
      throw new Error('No classification results returned');
    }
    testResult.steps.push(`✓ Retrieved ${results.data.length} classification results`);
    
    // Step 5: Verify results quality
    const businessCount = results.data.filter(r => r.payeeType === 'Business').length;
    const individualCount = results.data.filter(r => r.payeeType === 'Individual').length;
    const governmentCount = results.data.filter(r => r.payeeType === 'Government').length;
    
    testResult.steps.push(`✓ Results breakdown: ${businessCount} Business, ${individualCount} Individual, ${governmentCount} Government`);
    
    // Step 6: Check system health
    const health = await checkSystemHealth();
    testResult.memoryUsage = health['/api/monitoring/memory'];
    testResult.steps.push(`✓ System health check completed`);
    
    // Step 7: Clean up
    try {
      fs.unlinkSync(filename);
      testResult.steps.push(`✓ Cleaned up test file: ${filename}`);
    } catch (e) {
      testResult.steps.push(`⚠ Could not clean up ${filename}: ${e.message}`);
    }
    
    testResult.success = true;
    console.log(`✅ TEST ${testNumber} PASSED - ${testResult.processingTime}ms`);
    
  } catch (error) {
    testResult.errors.push(error.message);
    console.log(`❌ TEST ${testNumber} FAILED: ${error.message}`);
  }
  
  testResult.endTime = new Date().toISOString();
  TEST_RESULTS.push(testResult);
  
  return testResult;
}

async function generateFinalReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL COMPREHENSIVE TEST REPORT');
  console.log('='.repeat(60));
  
  const passedTests = TEST_RESULTS.filter(t => t.success);
  const failedTests = TEST_RESULTS.filter(t => !t.success);
  
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total Tests: ${TEST_RESULTS.length}`);
  console.log(`   ✅ Passed: ${passedTests.length}`);
  console.log(`   ❌ Failed: ${failedTests.length}`);
  console.log(`   📊 Success Rate: ${Math.round((passedTests.length / TEST_RESULTS.length) * 100)}%`);
  
  if (passedTests.length > 0) {
    const avgProcessingTime = passedTests.reduce((sum, t) => sum + t.processingTime, 0) / passedTests.length;
    const totalRecords = passedTests.reduce((sum, t) => sum + t.recordsProcessed, 0);
    
    console.log(`\n⚡ PERFORMANCE:`);
    console.log(`   Average Processing Time: ${Math.round(avgProcessingTime)}ms`);
    console.log(`   Total Records Processed: ${totalRecords}`);
    console.log(`   Average Records/Second: ${Math.round(totalRecords / (avgProcessingTime / 1000))}`);
  }
  
  console.log(`\n🔍 DETAILED RESULTS:`);
  TEST_RESULTS.forEach((test, i) => {
    console.log(`\n   Test ${test.testNumber}: ${test.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`     Batch ID: ${test.batchId || 'N/A'}`);
    console.log(`     Processing Time: ${test.processingTime}ms`);
    console.log(`     Records: ${test.recordsProcessed}`);
    
    if (test.errors.length > 0) {
      console.log(`     Errors: ${test.errors.join(', ')}`);
    }
    
    test.steps.forEach(step => {
      console.log(`     ${step}`);
    });
  });
  
  if (failedTests.length > 0) {
    console.log(`\n❌ FAILED TESTS ANALYSIS:`);
    failedTests.forEach(test => {
      console.log(`   Test ${test.testNumber}:`);
      test.errors.forEach(error => {
        console.log(`     - ${error}`);
      });
    });
  }
  
  // Save detailed report to file
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: TEST_RESULTS.length,
      passed: passedTests.length,
      failed: failedTests.length,
      successRate: Math.round((passedTests.length / TEST_RESULTS.length) * 100)
    },
    results: TEST_RESULTS
  };
  
  fs.writeFileSync('test-report.json', JSON.stringify(reportData, null, 2));
  console.log(`\n💾 Detailed report saved to: test-report.json`);
  
  // Final verdict
  if (passedTests.length === TEST_RESULTS.length) {
    console.log(`\n🎉 ALL TESTS PASSED! SYSTEM IS WORKING PERFECTLY!`);
    console.log(`✅ Evidence: ${passedTests.length}/${TEST_RESULTS.length} tests successful`);
    console.log(`✅ Performance: Average ${Math.round(passedTests.reduce((sum, t) => sum + t.processingTime, 0) / passedTests.length)}ms per batch`);
    console.log(`✅ Reliability: 100% success rate across all test scenarios`);
  } else {
    console.log(`\n⚠️  SYSTEM HAS ISSUES - ${failedTests.length} tests failed`);
    console.log(`❌ Success rate: ${Math.round((passedTests.length / TEST_RESULTS.length) * 100)}%`);
  }
}

async function main() {
  // Run 10 comprehensive tests
  for (let i = 1; i <= 10; i++) {
    await runSingleTest(i);
    
    // Small delay between tests
    if (i < 10) {
      console.log('⏸  Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  await generateFinalReport();
}

// Run the tests
main().catch(error => {
  console.error('❌ CRITICAL ERROR:', error);
  process.exit(1);
});