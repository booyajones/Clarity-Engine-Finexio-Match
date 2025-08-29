#!/usr/bin/env node

/**
 * DATABASE PERFORMANCE OPTIMIZATION - DEBUGGING CYCLE 2/10
 * Check and optimize database queries and indexes
 */

import fs from 'fs';

console.log('🗄️ DATABASE PERFORMANCE ANALYSIS - DEBUGGING CYCLE 2/10');
console.log('=' .repeat(60));

async function fetch(url, options = {}) {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

// Test database query performance
async function testQueryPerformance() {
  console.log('\n📊 Testing database query performance...');
  
  const start = Date.now();
  const response = await fetch('http://localhost:5000/api/upload/batches');
  const end = Date.now();
  
  const queryTime = end - start;
  console.log(`✅ Batch query time: ${queryTime}ms`);
  
  if (queryTime > 1000) {
    console.log('⚠️ Slow query detected - needs optimization');
    return false;
  } else if (queryTime > 500) {
    console.log('🟡 Query time acceptable but could be improved');
    return true;
  } else {
    console.log('✅ Query time excellent');
    return true;
  }
}

// Check for database optimization opportunities
function analyzeStorage() {
  console.log('\n🔍 Analyzing storage.ts for optimization opportunities...');
  
  const storageContent = fs.readFileSync('server/storage.ts', 'utf8');
  const issues = [];
  
  // Check for N+1 queries
  if (storageContent.includes('for (') && storageContent.includes('await db.select')) {
    issues.push('Potential N+1 query pattern detected in loops');
  }
  
  // Check for missing indexes
  if (storageContent.includes('LIKE') || storageContent.includes('ilike')) {
    issues.push('Text search queries may benefit from trigram indexes');
  }
  
  // Check for large result sets without pagination
  const selectQueries = (storageContent.match(/await db\.select\(\)/g) || []).length;
  const limitQueries = (storageContent.match(/\.limit\(/g) || []).length;
  
  if (selectQueries > limitQueries + 2) {
    issues.push(`${selectQueries - limitQueries} queries without pagination limits`);
  }
  
  console.log(`✅ Found ${selectQueries} select queries, ${limitQueries} with limits`);
  
  if (issues.length > 0) {
    console.log('\n⚠️ Database optimization opportunities:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  } else {
    console.log('✅ No major database issues detected');
  }
  
  return issues;
}

// Check memory usage during database operations
async function testMemoryDuringQueries() {
  console.log('\n🧠 Testing memory usage during database operations...');
  
  const beforeResponse = await fetch('http://localhost:5000/api/monitoring/memory');
  const beforeData = await beforeResponse.json();
  
  // Trigger some database operations
  await fetch('http://localhost:5000/api/upload/batches');
  await fetch('http://localhost:5000/api/dashboard/stats');
  
  const afterResponse = await fetch('http://localhost:5000/api/monitoring/memory');
  const afterData = await afterResponse.json();
  
  const memoryDiff = afterData.heapUsedMB - beforeData.heapUsedMB;
  
  console.log(`📈 Memory before: ${beforeData.heapUsedMB}MB`);
  console.log(`📈 Memory after:  ${afterData.heapUsedMB}MB`);
  console.log(`📊 Memory diff:   ${memoryDiff > 0 ? '+' : ''}${memoryDiff.toFixed(2)}MB`);
  
  if (memoryDiff > 10) {
    console.log('⚠️ Significant memory increase during queries - potential leak');
    return false;
  } else {
    console.log('✅ Memory usage stable during database operations');
    return true;
  }
}

// Main execution
try {
  const queryPerf = await testQueryPerformance();
  const storageIssues = analyzeStorage();
  const memoryStable = await testMemoryDuringQueries();
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 DATABASE PERFORMANCE SUMMARY - CYCLE 2/10');
  console.log('=' .repeat(60));
  console.log(`🔍 Query Performance: ${queryPerf ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
  console.log(`🔍 Storage Analysis: ${storageIssues.length === 0 ? 'CLEAN' : storageIssues.length + ' ISSUES'}`);
  console.log(`🔍 Memory Stability: ${memoryStable ? 'STABLE' : 'UNSTABLE'}`);
  
  if (storageIssues.length > 0 || !queryPerf || !memoryStable) {
    console.log('\n🎯 RECOMMENDED OPTIMIZATIONS:');
    if (storageIssues.length > 0) {
      console.log('   - Add database indexes for frequently queried fields');
      console.log('   - Implement query result caching');
      console.log('   - Add pagination to large result sets');
    }
    if (!queryPerf) {
      console.log('   - Optimize slow database queries');
      console.log('   - Consider connection pooling optimization');
    }
    if (!memoryStable) {
      console.log('   - Check for database connection leaks');
      console.log('   - Implement result streaming for large datasets');
    }
  }
  
} catch (error) {
  console.error('❌ Database performance test failed:', error.message);
}

console.log('\n🎯 NEXT: DEBUGGING CYCLE 3/10 - Code cleanup and refactoring');