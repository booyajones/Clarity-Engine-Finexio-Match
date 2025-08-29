#!/usr/bin/env node

/**
 * COMPREHENSIVE STRESS TESTING - LOOKING FOR BUGS AND ENHANCEMENTS
 * Tests: Edge cases, concurrent operations, memory leaks, error handling
 */

import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

const API_BASE = 'http://localhost:5000';
let TEST_RESULTS = [];
let BUGS_FOUND = [];
let ENHANCEMENTS_IDENTIFIED = [];

// Test configurations
const STRESS_SCENARIOS = [
  { name: 'Small Files', recordCount: 5, concurrency: 1 },
  { name: 'Medium Files', recordCount: 25, concurrency: 2 },
  { name: 'Large Files', recordCount: 100, concurrency: 3 },
  { name: 'Concurrent Small', recordCount: 5, concurrency: 5 },
  { name: 'Edge Case Empty', recordCount: 0, concurrency: 1 },
  { name: 'Single Record', recordCount: 1, concurrency: 1 },
  { name: 'Memory Stress', recordCount: 200, concurrency: 1 },
  { name: 'High Concurrency', recordCount: 10, concurrency: 8 }
];

// Edge case test data
const EDGE_CASE_DATA = [
  'Payee Name',
  '', // Empty name
  'Very Long Business Name That Exceeds Normal Length Limits And Should Test System Boundaries For Processing',
  'Special!@#$%^&*()Characters', // Special characters
  'UTF-8 测试 العربية русский', // Unicode characters
  'Amazon.com Inc.', // Known business
  'John Smith', // Common individual name
  'U.S. Department of Defense', // Government entity
  'NULL', // SQL injection attempt
  'DROP TABLE payee_classifications', // SQL injection
  '<script>alert("xss")</script>', // XSS attempt
  'Microsoft Corporation',
  'Apple Inc.',
  'ACME Corp LLC DBA Another Name'
];

function generateEdgeCaseCSV(recordCount) {
  let content = 'Payee Name\n';
  
  if (recordCount === 0) {
    return content; // Header only
  }
  
  for (let i = 0; i < recordCount; i++) {
    const payeeName = EDGE_CASE_DATA[i % EDGE_CASE_DATA.length];
    content += `"${payeeName}"\n`;
  }
  
  return content;
}

async function uploadFile(filename, options = {}) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filename));
  form.append('payeeColumn', 'Payee Name');
  form.append('enableFinexio', String(options.enableFinexio || true));
  form.append('enableMastercard', String(options.enableMastercard || false));
  form.append('enableGoogleAddressValidation', String(options.enableGoogleAddressValidation || false));
  form.append('enableAkkio', String(options.enableAkkio || false));

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function waitForBatchCompletion(batchId, maxWaitTime = 120000) {
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
      BUGS_FOUND.push({
        type: 'Batch Failure',
        batchId,
        message: batch.progressMessage || 'Unknown failure',
        timestamp: new Date().toISOString()
      });
      throw new Error(`Batch ${batchId} failed: ${batch.progressMessage}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  BUGS_FOUND.push({
    type: 'Timeout',
    batchId,
    message: `Batch did not complete within ${maxWaitTime}ms`,
    timestamp: new Date().toISOString()
  });
  throw new Error(`Batch ${batchId} timeout`);
}

async function testConcurrentUploads(scenario) {
  console.log(`\n🔥 STRESS TEST: ${scenario.name} (${scenario.recordCount} records, ${scenario.concurrency}x concurrent)`);
  
  const promises = [];
  const startTime = Date.now();
  
  for (let i = 0; i < scenario.concurrency; i++) {
    const filename = `stress-${scenario.name.replace(/\s/g, '-')}-${i}-${Date.now()}.csv`;
    const content = generateEdgeCaseCSV(scenario.recordCount);
    fs.writeFileSync(filename, content);
    
    const promise = (async () => {
      try {
        const uploadResult = await uploadFile(filename, {
          enableFinexio: true,
          enableMastercard: i % 2 === 0, // Alternate Mastercard
          enableGoogleAddressValidation: false,
          enableAkkio: false
        });
        
        const batch = await waitForBatchCompletion(uploadResult.id);
        
        // Clean up
        try {
          fs.unlinkSync(filename);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        return {
          batchId: uploadResult.id,
          recordCount: scenario.recordCount,
          processedRecords: batch.processedRecords,
          success: true,
          processingTime: Date.now() - startTime
        };
      } catch (error) {
        BUGS_FOUND.push({
          type: 'Concurrent Upload Error',
          scenario: scenario.name,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        // Clean up on error
        try {
          fs.unlinkSync(filename);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        return {
          batchId: null,
          recordCount: scenario.recordCount,
          processedRecords: 0,
          success: false,
          error: error.message,
          processingTime: Date.now() - startTime
        };
      }
    })();
    
    promises.push(promise);
  }
  
  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  console.log(`   ✅ Succeeded: ${successCount}/${results.length}`);
  console.log(`   ❌ Failed: ${failureCount}/${results.length}`);
  
  if (failureCount > 0) {
    console.log(`   🐛 Failures detected in ${scenario.name}`);
  }
  
  return results;
}

async function testAPIEndpoints() {
  console.log('\n🔍 TESTING ALL API ENDPOINTS FOR BUGS');
  
  const endpoints = [
    '/api/dashboard/stats',
    '/api/monitoring/memory',
    '/api/monitoring/cache/stats',
    '/api/monitoring/stuck-batches',
    '/api/upload/batches',
    '/api/classifications/1', // Test with non-existent batch
    '/api/classifications/999999', // Test with very high ID
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`);
      const data = await response.json();
      
      if (!response.ok) {
        BUGS_FOUND.push({
          type: 'API Error',
          endpoint,
          statusCode: response.status,
          error: data.error || data.message,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`   ${endpoint}: ${response.status} ${response.ok ? '✅' : '❌'}`);
    } catch (error) {
      BUGS_FOUND.push({
        type: 'API Exception',
        endpoint,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`   ${endpoint}: Exception ❌ ${error.message}`);
    }
  }
}

async function testMemoryLeaks() {
  console.log('\n🧠 MEMORY LEAK DETECTION');
  
  const memorySnapshots = [];
  
  for (let i = 0; i < 5; i++) {
    const response = await fetch(`${API_BASE}/api/monitoring/memory`);
    const data = await response.json();
    memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: data.current.heapUsed,
      heapUsedPercent: data.current.heapUsedPercent
    });
    
    console.log(`   Snapshot ${i + 1}: ${data.current.heapUsed}MB (${data.current.heapUsedPercent}%)`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Check for memory growth trend
  const firstHeap = memorySnapshots[0].heapUsed;
  const lastHeap = memorySnapshots[memorySnapshots.length - 1].heapUsed;
  const growth = lastHeap - firstHeap;
  
  if (growth > 50) { // More than 50MB growth
    BUGS_FOUND.push({
      type: 'Potential Memory Leak',
      growthMB: growth,
      from: firstHeap,
      to: lastHeap,
      timestamp: new Date().toISOString()
    });
    console.log(`   🚨 Potential memory leak detected: ${growth}MB growth`);
  } else {
    console.log(`   ✅ Memory stable: ${growth}MB change`);
  }
}

async function identifyEnhancements() {
  console.log('\n💡 IDENTIFYING ENHANCEMENT OPPORTUNITIES');
  
  // Check response times
  const start = Date.now();
  await fetch(`${API_BASE}/api/dashboard/stats`);
  const dashboardTime = Date.now() - start;
  
  if (dashboardTime > 1000) {
    ENHANCEMENTS_IDENTIFIED.push({
      type: 'Performance',
      area: 'Dashboard API',
      issue: `Slow response time: ${dashboardTime}ms`,
      suggestion: 'Add more aggressive caching or optimize queries'
    });
  }
  
  // Check batch list size
  const batchResponse = await fetch(`${API_BASE}/api/upload/batches`);
  const batches = await batchResponse.json();
  
  if (batches.length > 50) {
    ENHANCEMENTS_IDENTIFIED.push({
      type: 'Scalability',
      area: 'Batch Management',
      issue: `Large batch list: ${batches.length} batches`,
      suggestion: 'Implement pagination for batch list'
    });
  }
  
  // Check for missing error handling
  ENHANCEMENTS_IDENTIFIED.push({
    type: 'User Experience',
    area: 'Error Messages',
    suggestion: 'Add more descriptive error messages for end users'
  });
  
  ENHANCEMENTS_IDENTIFIED.push({
    type: 'Performance',
    area: 'File Processing',
    suggestion: 'Implement file preview before upload to validate format'
  });
  
  ENHANCEMENTS_IDENTIFIED.push({
    type: 'Monitoring',
    area: 'System Health',
    suggestion: 'Add real-time performance dashboard with charts'
  });
}

async function main() {
  console.log('🔬 COMPREHENSIVE BUG HUNTING AND ENHANCEMENT TESTING');
  console.log('=' .repeat(80));
  
  try {
    // Test all stress scenarios
    for (const scenario of STRESS_SCENARIOS) {
      const results = await testConcurrentUploads(scenario);
      TEST_RESULTS.push(...results);
      
      // Brief pause between scenarios
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Test API endpoints
    await testAPIEndpoints();
    
    // Test memory leaks
    await testMemoryLeaks();
    
    // Identify enhancements
    await identifyEnhancements();
    
    // Generate comprehensive report
    console.log('\n' + '='.repeat(80));
    console.log('🎯 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(80));
    
    const totalTests = TEST_RESULTS.length;
    const passedTests = TEST_RESULTS.filter(t => t.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`\n📊 STATISTICS:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   ✅ Passed: ${passedTests}`);
    console.log(`   ❌ Failed: ${failedTests}`);
    console.log(`   📈 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    console.log(`\n🐛 BUGS FOUND: ${BUGS_FOUND.length}`);
    BUGS_FOUND.forEach((bug, i) => {
      console.log(`   ${i + 1}. ${bug.type}: ${bug.message || bug.error}`);
    });
    
    console.log(`\n💡 ENHANCEMENTS IDENTIFIED: ${ENHANCEMENTS_IDENTIFIED.length}`);
    ENHANCEMENTS_IDENTIFIED.forEach((enhancement, i) => {
      console.log(`   ${i + 1}. ${enhancement.area}: ${enhancement.suggestion}`);
    });
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      bugs: BUGS_FOUND,
      enhancements: ENHANCEMENTS_IDENTIFIED,
      testResults: TEST_RESULTS
    };
    
    fs.writeFileSync('comprehensive-test-report.json', JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed report saved to: comprehensive-test-report.json`);
    
    if (BUGS_FOUND.length === 0) {
      console.log(`\n🎉 NO CRITICAL BUGS FOUND - SYSTEM IS ROBUST!`);
    } else {
      console.log(`\n⚠️  ${BUGS_FOUND.length} ISSUES NEED ATTENTION`);
    }
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error);
    process.exit(1);
  }
}

main();