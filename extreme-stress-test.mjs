#!/usr/bin/env node

/**
 * EXTREME STRESS TEST - Find all optimization opportunities
 * Tests system limits, memory leaks, performance bottlenecks
 */

import fs from 'fs';

console.log('🔥 EXTREME STRESS TEST - FINDING ALL OPTIMIZATION OPPORTUNITIES');
console.log('=' .repeat(70));

async function fetch(url, options = {}) {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

const results = {
  tests: 0,
  passed: 0,
  failed: 0,
  optimizations: [],
  criticalIssues: []
};

async function stressTest(name, testFn) {
  try {
    console.log(`\n🧪 STRESS TEST: ${name}`);
    results.tests++;
    const result = await testFn();
    if (result.success) {
      results.passed++;
      console.log(`✅ ${name}: PASSED`);
    } else {
      results.failed++;
      console.log(`❌ ${name}: FAILED - ${result.issue}`);
      if (result.critical) {
        results.criticalIssues.push(result.issue);
      }
    }
    if (result.optimizations) {
      results.optimizations.push(...result.optimizations);
    }
  } catch (error) {
    results.failed++;
    console.log(`❌ ${name}: ERROR - ${error.message}`);
    results.criticalIssues.push(`${name}: ${error.message}`);
  }
}

// TEST 1: EXTREME CONCURRENT LOAD
await stressTest('Extreme Concurrent Load (100 requests)', async () => {
  const promises = [];
  const endpoints = [
    '/api/dashboard/stats',
    '/api/upload/batches',
    '/api/monitoring/memory'
  ];
  
  const start = Date.now();
  
  for (let i = 0; i < 100; i++) {
    const endpoint = endpoints[i % endpoints.length];
    promises.push(fetch(`http://localhost:5000${endpoint}`));
  }
  
  const responses = await Promise.all(promises);
  const end = Date.now();
  
  const failed = responses.filter(r => !r.ok).length;
  const avgTime = (end - start) / 100;
  
  const optimizations = [];
  if (avgTime > 100) {
    optimizations.push(`High average response time: ${avgTime}ms - consider connection pooling`);
  }
  if (failed > 5) {
    optimizations.push(`${failed}% request failure rate - improve error handling`);
  }
  
  return {
    success: failed < 10,
    issue: failed >= 10 ? `${failed}/100 requests failed` : null,
    optimizations,
    metrics: { avgTime, failureRate: failed }
  };
});

// TEST 2: MEMORY LEAK DETECTION
await stressTest('Memory Leak Detection', async () => {
  const initialResponse = await fetch('http://localhost:5000/api/monitoring/memory');
  const initialData = await initialResponse.json();
  
  // Generate load for 30 seconds
  const endTime = Date.now() + 30000;
  let requestCount = 0;
  
  while (Date.now() < endTime) {
    await fetch('http://localhost:5000/api/upload/batches');
    requestCount++;
    if (requestCount % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
    }
  }
  
  const finalResponse = await fetch('http://localhost:5000/api/monitoring/memory');
  const finalData = await finalResponse.json();
  
  const memoryIncrease = finalData.heapUsed - initialData.heapUsed;
  const memoryIncreasePercent = (memoryIncrease / initialData.heapUsed) * 100;
  
  const optimizations = [];
  if (memoryIncrease > 20) {
    optimizations.push(`Significant memory increase: ${memoryIncrease}MB after ${requestCount} requests`);
    optimizations.push('Consider implementing result streaming for large datasets');
  }
  if (finalData.heapUsedPercent > 95) {
    optimizations.push('Critical memory usage - enable garbage collection with --expose-gc');
  }
  
  return {
    success: memoryIncrease < 30,
    issue: memoryIncrease >= 30 ? `Memory leak detected: +${memoryIncrease}MB` : null,
    critical: memoryIncrease >= 50,
    optimizations,
    metrics: { memoryIncrease, requestCount, finalMemoryPercent: finalData.heapUsedPercent }
  };
});

// TEST 3: DATABASE QUERY PERFORMANCE
await stressTest('Database Query Performance Analysis', async () => {
  const queryTimes = [];
  const batchSizes = [];
  
  for (let i = 0; i < 20; i++) {
    const start = Date.now();
    const response = await fetch('http://localhost:5000/api/upload/batches');
    const end = Date.now();
    
    if (response.ok) {
      const data = await response.json();
      queryTimes.push(end - start);
      batchSizes.push(data.length);
    }
  }
  
  const avgTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
  const maxTime = Math.max(...queryTimes);
  const avgBatchSize = batchSizes.reduce((a, b) => a + b, 0) / batchSizes.length;
  
  const optimizations = [];
  if (avgTime > 200) {
    optimizations.push(`Slow database queries: ${avgTime}ms average - add database indexes`);
  }
  if (maxTime > 500) {
    optimizations.push(`Very slow queries detected: ${maxTime}ms max - optimize query structure`);
  }
  if (avgBatchSize > 100) {
    optimizations.push(`Large result sets: ${avgBatchSize} avg records - implement pagination`);
  }
  
  return {
    success: avgTime < 300,
    issue: avgTime >= 300 ? `Slow queries: ${avgTime}ms average` : null,
    optimizations,
    metrics: { avgTime, maxTime, avgBatchSize }
  };
});

// TEST 4: RATE LIMITING EFFECTIVENESS
await stressTest('Rate Limiting and Security', async () => {
  const rapidRequests = [];
  
  // Send 50 rapid requests
  for (let i = 0; i < 50; i++) {
    rapidRequests.push(fetch('http://localhost:5000/api/dashboard/stats'));
  }
  
  const responses = await Promise.all(rapidRequests);
  const rateLimited = responses.filter(r => r.status === 429).length;
  const successful = responses.filter(r => r.ok).length;
  
  const optimizations = [];
  if (rateLimited === 0 && successful === 50) {
    optimizations.push('Rate limiting may be too permissive - consider stricter limits');
  }
  if (successful < 30) {
    optimizations.push('Rate limiting too strict - may impact legitimate users');
  }
  
  return {
    success: successful >= 30 && successful <= 45,
    issue: successful < 30 ? 'Rate limiting too strict' : successful > 45 ? 'Rate limiting too permissive' : null,
    optimizations,
    metrics: { successful, rateLimited }
  };
});

// TEST 5: ERROR HANDLING ROBUSTNESS
await stressTest('Error Handling Robustness', async () => {
  const errorTests = [
    { url: '/api/classifications/invalid123', expectedStatus: [400, 500] },
    { url: '/api/nonexistent/endpoint', expectedStatus: [404] },
    { url: '/api/upload', method: 'POST', expectedStatus: [400, 422] },
    { url: '/api/classifications/-1', expectedStatus: [400, 404] },
    { url: '/api/classifications/999999999', expectedStatus: [404] }
  ];
  
  let properErrorHandling = 0;
  const optimizations = [];
  
  for (const test of errorTests) {
    const response = await fetch(`http://localhost:5000${test.url}`, { 
      method: test.method || 'GET' 
    });
    
    if (test.expectedStatus.includes(response.status)) {
      properErrorHandling++;
    } else {
      optimizations.push(`Improper error handling for ${test.url}: got ${response.status}, expected ${test.expectedStatus}`);
    }
  }
  
  return {
    success: properErrorHandling >= 4,
    issue: properErrorHandling < 4 ? `Poor error handling: ${properErrorHandling}/5 tests passed` : null,
    optimizations,
    metrics: { properErrorHandling, totalTests: errorTests.length }
  };
});

// FINAL ANALYSIS
console.log('\n' + '=' .repeat(70));
console.log('🔥 EXTREME STRESS TEST RESULTS');
console.log('=' .repeat(70));
console.log(`📊 Tests Run: ${results.tests}`);
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📈 Success Rate: ${Math.round((results.passed / results.tests) * 100)}%`);

if (results.criticalIssues.length > 0) {
  console.log('\n🚨 CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:');
  results.criticalIssues.forEach(issue => console.log(`   ❌ ${issue}`));
}

const uniqueOptimizations = results.optimizations.length > 0 ? [...new Set(results.optimizations)] : [];

if (uniqueOptimizations.length > 0) {
  console.log('\n🎯 OPTIMIZATION OPPORTUNITIES:');
  uniqueOptimizations.forEach(opt => console.log(`   🔧 ${opt}`));
}

// Write detailed report
const report = {
  timestamp: new Date().toISOString(),
  testResults: results,
  systemHealth: {
    memoryUsage: await fetch('http://localhost:5000/api/monitoring/memory').then(r => r.json()).catch(() => null)
  },
  recommendations: uniqueOptimizations
};

fs.writeFileSync('extreme-test-report.json', JSON.stringify(report, null, 2));
console.log('\n📋 Detailed report saved to: extreme-test-report.json');

console.log('\n🎯 READY FOR OPTIMIZATION IMPLEMENTATION');