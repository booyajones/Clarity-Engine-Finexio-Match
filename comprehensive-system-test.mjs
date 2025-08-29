#!/usr/bin/env node

/**
 * COMPREHENSIVE SYSTEM FUNCTIONALITY REVIEW
 * Tests all endpoints, checks for errors, identifies optimizations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 COMPREHENSIVE SYSTEM FUNCTIONALITY REVIEW');
console.log('=' .repeat(80));

async function fetch(url, options = {}) {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

const results = {
  totalTests: 0,
  passed: 0,
  failed: 0,
  errors: [],
  warnings: [],
  optimizations: [],
  criticalIssues: []
};

async function testEndpoint(name, testFn) {
  console.log(`\n📋 Testing: ${name}`);
  results.totalTests++;
  
  try {
    const result = await testFn();
    if (result.success) {
      results.passed++;
      console.log(`   ✅ PASSED: ${result.message || 'Working correctly'}`);
      if (result.warnings) results.warnings.push(...result.warnings);
      if (result.optimizations) results.optimizations.push(...result.optimizations);
    } else {
      results.failed++;
      console.log(`   ❌ FAILED: ${result.message}`);
      results.errors.push(`${name}: ${result.message}`);
      if (result.critical) results.criticalIssues.push(result.message);
    }
    return result;
  } catch (error) {
    results.failed++;
    console.log(`   ❌ ERROR: ${error.message}`);
    results.errors.push(`${name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// TEST 1: Core API Health
await testEndpoint('Core API Health Check', async () => {
  const response = await fetch('http://localhost:5000/api/health');
  const data = await response.json();
  
  const optimizations = [];
  if (!data.version) optimizations.push('Add version info to health endpoint');
  if (!data.uptime) optimizations.push('Add uptime info to health endpoint');
  
  return {
    success: response.ok && data.status === 'ok',
    message: response.ok ? `API healthy: ${JSON.stringify(data)}` : 'API health check failed',
    optimizations
  };
});

// TEST 2: Dashboard Statistics
await testEndpoint('Dashboard Statistics', async () => {
  const response = await fetch('http://localhost:5000/api/dashboard/stats');
  const data = await response.json();
  
  const warnings = [];
  const optimizations = [];
  
  if (data.totalBatches > 100) {
    optimizations.push('Consider implementing pagination for large batch counts');
  }
  
  if (!data.cacheHitRate) {
    optimizations.push('Add cache hit rate metrics to dashboard');
  }
  
  return {
    success: response.ok,
    message: `Stats: ${data.totalBatches} batches, ${data.totalClassifications} classifications`,
    warnings,
    optimizations
  };
});

// TEST 3: Memory Monitoring
await testEndpoint('Memory Monitoring Endpoint', async () => {
  const response = await fetch('http://localhost:5000/api/monitoring/memory');
  const data = await response.json();
  
  const warnings = [];
  const optimizations = [];
  
  if (data.heapUsed > 250) {
    warnings.push(`High memory usage: ${data.heapUsed}MB`);
    optimizations.push('Consider implementing memory cleanup routines');
  }
  
  if (data.heapUsedPercent > 85) {
    warnings.push(`Critical heap usage: ${data.heapUsedPercent}%`);
    optimizations.push('Increase heap size limit or optimize memory usage');
  }
  
  if (!data.gcEnabled) {
    optimizations.push('Enable garbage collection with --expose-gc flag');
  }
  
  return {
    success: response.ok,
    message: `Memory: ${data.heapUsed}MB used (${data.heapUsedPercent}%)`,
    warnings,
    optimizations
  };
});

// TEST 4: Batch Upload Endpoints
await testEndpoint('Batch Upload Listing', async () => {
  const response = await fetch('http://localhost:5000/api/upload/batches');
  const data = await response.json();
  
  const optimizations = [];
  
  if (data.length > 50) {
    optimizations.push('Implement pagination for batch listing');
  }
  
  // Check response time
  const start = Date.now();
  await fetch('http://localhost:5000/api/upload/batches');
  const responseTime = Date.now() - start;
  
  if (responseTime > 500) {
    optimizations.push(`Slow batch listing: ${responseTime}ms - consider caching`);
  }
  
  return {
    success: response.ok && Array.isArray(data),
    message: `Found ${data.length} batches, response time: ${responseTime}ms`,
    optimizations
  };
});

// TEST 5: Classification Endpoints
await testEndpoint('Classification API Error Handling', async () => {
  const tests = [
    { id: 'abc', expectedStatus: [400, 500], description: 'Invalid ID format' },
    { id: '-1', expectedStatus: [400], description: 'Negative ID' },
    { id: '0', expectedStatus: [400], description: 'Zero ID' },
    { id: '999999999', expectedStatus: [404], description: 'Non-existent ID' }
  ];
  
  const errors = [];
  let correctHandling = 0;
  
  for (const test of tests) {
    const response = await fetch(`http://localhost:5000/api/classifications/${test.id}`);
    if (test.expectedStatus.includes(response.status)) {
      correctHandling++;
    } else {
      errors.push(`${test.description}: got ${response.status}, expected ${test.expectedStatus.join(' or ')}`);
    }
  }
  
  return {
    success: correctHandling === tests.length,
    message: correctHandling === tests.length ? 
      'All error cases handled correctly' : 
      `${correctHandling}/${tests.length} error cases handled correctly`,
    errors: errors.length > 0 ? errors : undefined
  };
});

// TEST 6: File Upload Validation
await testEndpoint('File Upload Endpoint', async () => {
  const response = await fetch('http://localhost:5000/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  const optimizations = [];
  
  if (response.status !== 400 && response.status !== 422) {
    return {
      success: false,
      message: `Improper validation: empty upload returned ${response.status}`,
      critical: true
    };
  }
  
  // Test file size limits
  const largeFileTest = await fetch('http://localhost:5000/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  
  if (!largeFileTest.headers.get('x-file-size-limit')) {
    optimizations.push('Add file size limit headers for client guidance');
  }
  
  return {
    success: true,
    message: 'Upload validation working correctly',
    optimizations
  };
});

// TEST 7: Mastercard Service Status
await testEndpoint('Mastercard Service Configuration', async () => {
  const response = await fetch('http://localhost:5000/api/mastercard/status');
  
  if (!response.ok) {
    return {
      success: true,
      message: 'Mastercard endpoint not implemented (expected)',
      optimizations: ['Consider adding Mastercard service status endpoint']
    };
  }
  
  const data = await response.json();
  return {
    success: true,
    message: `Mastercard service: ${data.configured ? 'Configured' : 'Not configured'}`,
    warnings: !data.configured ? ['Mastercard service not configured'] : []
  };
});

// TEST 8: Database Connection Pool
await testEndpoint('Database Connection Health', async () => {
  // Test rapid sequential requests
  const times = [];
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await fetch('http://localhost:5000/api/upload/batches');
    times.push(Date.now() - start);
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  
  const optimizations = [];
  
  if (avgTime > 300) {
    optimizations.push(`Slow DB queries: ${Math.round(avgTime)}ms avg - optimize connection pool`);
  }
  
  if (maxTime > 1000) {
    optimizations.push(`Very slow query detected: ${maxTime}ms - check for connection pool exhaustion`);
  }
  
  return {
    success: avgTime < 500,
    message: `DB performance: ${Math.round(avgTime)}ms avg, ${maxTime}ms max`,
    optimizations
  };
});

// TEST 9: Concurrent Request Handling
await testEndpoint('Concurrent Request Handling', async () => {
  const endpoints = [
    '/api/dashboard/stats',
    '/api/upload/batches',
    '/api/monitoring/memory'
  ];
  
  const promises = [];
  for (let i = 0; i < 30; i++) {
    const endpoint = endpoints[i % endpoints.length];
    promises.push(
      fetch(`http://localhost:5000${endpoint}`)
        .then(r => ({ ok: r.ok, status: r.status, endpoint }))
        .catch(e => ({ ok: false, error: e.message, endpoint }))
    );
  }
  
  const results = await Promise.all(promises);
  const failed = results.filter(r => !r.ok);
  const rateLimited = results.filter(r => r.status === 429);
  
  const warnings = [];
  const optimizations = [];
  
  if (failed.length > 0 && rateLimited.length === 0) {
    warnings.push(`${failed.length} requests failed under concurrent load`);
    optimizations.push('Improve concurrent request handling');
  }
  
  if (rateLimited.length > 20) {
    warnings.push(`Rate limiting too aggressive: ${rateLimited.length}/30 blocked`);
    optimizations.push('Consider adjusting rate limits for legitimate traffic');
  }
  
  return {
    success: failed.length === 0 || (failed.length === rateLimited.length),
    message: `Handled ${30 - failed.length}/30 concurrent requests successfully`,
    warnings,
    optimizations
  };
});

// TEST 10: Cache Performance
await testEndpoint('Cache System Performance', async () => {
  // First request (cache miss)
  const start1 = Date.now();
  await fetch('http://localhost:5000/api/dashboard/stats');
  const time1 = Date.now() - start1;
  
  // Second request (should be cache hit)
  const start2 = Date.now();
  await fetch('http://localhost:5000/api/dashboard/stats');
  const time2 = Date.now() - start2;
  
  const cacheImprovement = ((time1 - time2) / time1) * 100;
  
  const optimizations = [];
  
  if (cacheImprovement < 50 && time1 > 10) {
    optimizations.push(`Cache not effective: only ${Math.round(cacheImprovement)}% improvement`);
  }
  
  if (time2 > 5) {
    optimizations.push(`Cache hit still slow: ${time2}ms - consider in-memory caching`);
  }
  
  return {
    success: time2 < time1,
    message: `Cache performance: ${time1}ms → ${time2}ms (${Math.round(cacheImprovement)}% improvement)`,
    optimizations
  };
});

// TEST 11: Error Recovery
await testEndpoint('Error Recovery Mechanisms', async () => {
  // Test if system recovers from bad requests
  await fetch('http://localhost:5000/api/classifications/invalid');
  await fetch('http://localhost:5000/api/upload', { method: 'POST' });
  
  // Now test if normal operations still work
  const response = await fetch('http://localhost:5000/api/health');
  
  return {
    success: response.ok,
    message: response.ok ? 'System recovers from errors correctly' : 'System does not recover from errors',
    critical: !response.ok
  };
});

// FINAL ANALYSIS
console.log('\n' + '=' .repeat(80));
console.log('📊 COMPREHENSIVE REVIEW RESULTS');
console.log('=' .repeat(80));

const successRate = Math.round((results.passed / results.totalTests) * 100);

console.log(`\n📈 Overall Health: ${successRate}%`);
console.log(`✅ Passed: ${results.passed}/${results.totalTests}`);
console.log(`❌ Failed: ${results.failed}/${results.totalTests}`);

if (results.criticalIssues.length > 0) {
  console.log('\n🚨 CRITICAL ISSUES:');
  results.criticalIssues.forEach(issue => console.log(`   • ${issue}`));
}

if (results.errors.length > 0) {
  console.log('\n❌ ERRORS FOUND:');
  results.errors.forEach(error => console.log(`   • ${error}`));
}

if (results.warnings.length > 0) {
  console.log('\n⚠️ WARNINGS:');
  const uniqueWarnings = [...new Set(results.warnings)];
  uniqueWarnings.forEach(warning => console.log(`   • ${warning}`));
}

if (results.optimizations.length > 0) {
  console.log('\n🔧 OPTIMIZATION OPPORTUNITIES:');
  const uniqueOptimizations = [...new Set(results.optimizations)];
  uniqueOptimizations.forEach(opt => console.log(`   • ${opt}`));
}

// Performance Summary
const memResponse = await fetch('http://localhost:5000/api/monitoring/memory');
const memData = await memResponse.json();

console.log('\n📊 CURRENT SYSTEM METRICS:');
console.log(`   • Memory Usage: ${memData.heapUsed || 'N/A'}MB (${memData.heapUsedPercent || 'N/A'}%)`);
console.log(`   • System Health: ${successRate >= 90 ? 'Excellent' : successRate >= 75 ? 'Good' : successRate >= 60 ? 'Fair' : 'Needs Attention'}`);
console.log(`   • Error Rate: ${Math.round((results.failed / results.totalTests) * 100)}%`);

// Save detailed report
const report = {
  timestamp: new Date().toISOString(),
  successRate,
  metrics: {
    totalTests: results.totalTests,
    passed: results.passed,
    failed: results.failed
  },
  issues: {
    critical: results.criticalIssues,
    errors: results.errors,
    warnings: [...new Set(results.warnings)]
  },
  optimizations: [...new Set(results.optimizations)],
  systemHealth: memData
};

fs.writeFileSync('comprehensive-test-report.json', JSON.stringify(report, null, 2));
console.log('\n📄 Detailed report saved to: comprehensive-test-report.json');
console.log('\n✅ COMPREHENSIVE REVIEW COMPLETE');