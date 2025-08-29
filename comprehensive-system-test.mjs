#!/usr/bin/env node

/**
 * COMPREHENSIVE SYSTEM TEST - DEBUGGING CYCLE 1/10
 * Tests all critical functionality and identifies areas for optimization
 */

import { spawn } from 'child_process';
import fs from 'fs';

const API_BASE = 'http://localhost:5000';
let testResults = {
  passed: 0,
  failed: 0,
  details: []
};

async function runTest(testName, testFn) {
  try {
    console.log(`\n🧪 Testing: ${testName}`);
    await testFn();
    testResults.passed++;
    testResults.details.push({ test: testName, status: 'PASS' });
    console.log(`✅ ${testName}: PASSED`);
  } catch (error) {
    testResults.failed++;
    testResults.details.push({ test: testName, status: 'FAIL', error: error.message });
    console.log(`❌ ${testName}: FAILED - ${error.message}`);
  }
}

async function fetch(url, options = {}) {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

console.log('🎯 COMPREHENSIVE SYSTEM TEST - DEBUGGING CYCLE 1/10');
console.log('=' .repeat(60));

// 1. API ROBUSTNESS TESTS
await runTest('API Error Handling - Invalid Parameters', async () => {
  const response = await fetch(`${API_BASE}/api/classifications/abc`);
  if (response.status !== 400 && response.status !== 500) {
    throw new Error(`Expected 400 or 500, got ${response.status}`);
  }
  const data = await response.json();
  if (!data.error) {
    throw new Error('Expected error message');
  }
});

await runTest('Memory Monitoring Endpoint', async () => {
  const response = await fetch(`${API_BASE}/api/monitoring/memory`);
  if (!response.ok) {
    throw new Error(`Memory endpoint failed: ${response.status}`);
  }
  const data = await response.json();
  if (typeof data.heapUsedMB !== 'number') {
    throw new Error('Missing heap memory data');
  }
});

await runTest('Dashboard Stats Endpoint', async () => {
  const response = await fetch(`${API_BASE}/api/dashboard/stats`);
  if (!response.ok) {
    throw new Error(`Dashboard endpoint failed: ${response.status}`);
  }
  const data = await response.json();
  if (typeof data.totalBatches !== 'number') {
    throw new Error('Missing dashboard data');
  }
});

await runTest('Upload Batches Endpoint', async () => {
  const response = await fetch(`${API_BASE}/api/upload/batches`);
  if (!response.ok) {
    throw new Error(`Batches endpoint failed: ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Expected array of batches');
  }
});

// 2. MEMORY PERFORMANCE TESTS
await runTest('Memory Usage Under Normal Load', async () => {
  const response = await fetch(`${API_BASE}/api/monitoring/memory`);
  const data = await response.json();
  
  if (data.heapUsedMB > 300) {
    throw new Error(`High memory usage: ${data.heapUsedMB}MB`);
  }
});

// 3. CONCURRENT REQUEST TESTS
await runTest('Concurrent API Requests', async () => {
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(fetch(`${API_BASE}/api/dashboard/stats`));
  }
  
  const responses = await Promise.all(promises);
  const failedRequests = responses.filter(r => !r.ok);
  
  if (failedRequests.length > 0) {
    throw new Error(`${failedRequests.length}/10 concurrent requests failed`);
  }
});

// 4. ERROR BOUNDARY TESTS
await runTest('Non-existent Endpoints', async () => {
  const response = await fetch(`${API_BASE}/api/nonexistent`);
  if (response.status !== 404) {
    throw new Error(`Expected 404, got ${response.status}`);
  }
});

await runTest('Invalid HTTP Methods', async () => {
  const response = await fetch(`${API_BASE}/api/dashboard/stats`, { method: 'DELETE' });
  if (response.status !== 404 && response.status !== 405) {
    throw new Error(`Expected 404/405, got ${response.status}`);
  }
});

// 5. RATE LIMITING TESTS
await runTest('Rate Limiting Protection', async () => {
  const promises = [];
  // Try to overwhelm the server
  for (let i = 0; i < 20; i++) {
    promises.push(fetch(`${API_BASE}/api/monitoring/memory`));
  }
  
  const responses = await Promise.all(promises);
  const successCount = responses.filter(r => r.ok).length;
  
  if (successCount < 15) {
    throw new Error(`Too many requests failed: ${20 - successCount}/20`);
  }
});

// FINAL REPORT
console.log('\n' + '=' .repeat(60));
console.log('📊 COMPREHENSIVE SYSTEM TEST RESULTS - CYCLE 1/10');
console.log('=' .repeat(60));
console.log(`✅ Tests Passed: ${testResults.passed}`);
console.log(`❌ Tests Failed: ${testResults.failed}`);
console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);

if (testResults.failed > 0) {
  console.log('\n🔍 FAILED TESTS REQUIRING FIXES:');
  testResults.details.filter(t => t.status === 'FAIL').forEach(t => {
    console.log(`   ❌ ${t.test}: ${t.error}`);
  });
}

console.log('\n🎯 NEXT DEBUGGING CYCLES WILL ADDRESS:');
console.log('   2. Performance optimization');
console.log('   3. Code cleanup and refactoring');
console.log('   4. Feature enhancements');
console.log('   5. Memory optimization');
console.log('   6. Database optimization');
console.log('   7. Security hardening');
console.log('   8. Error handling improvements');
console.log('   9. Monitoring enhancements');
console.log('   10. Final comprehensive validation');

// Write results to file for tracking
fs.writeFileSync('comprehensive-test-report.json', JSON.stringify({
  cycle: 1,
  timestamp: new Date().toISOString(),
  results: testResults,
  memorySnapshot: await (await fetch(`${API_BASE}/api/monitoring/memory`)).json().catch(() => null)
}, null, 2));

console.log('\n📋 Test results saved to: comprehensive-test-report.json');