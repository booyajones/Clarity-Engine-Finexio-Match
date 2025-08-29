#!/usr/bin/env node

/**
 * EMERGENCY MEMORY FIX - Clear caches and free memory immediately
 */

import fs from 'fs';

console.log('🚨 EMERGENCY MEMORY OPTIMIZATION');
console.log('=' .repeat(60));

async function fetch(url, options = {}) {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

async function getMemoryStatus() {
  try {
    const response = await fetch('http://localhost:5000/api/monitoring/memory');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get memory status:', error.message);
    return null;
  }
}

async function clearCaches() {
  console.log('\n🧹 CLEARING ALL CACHES...');
  
  // Call cache clear endpoint if it exists
  try {
    const response = await fetch('http://localhost:5000/api/admin/clear-caches', {
      method: 'POST'
    });
    if (response.ok) {
      console.log('✅ Caches cleared via API');
    }
  } catch (error) {
    console.log('⚠️ No cache clear endpoint available');
  }
}

async function optimizeMemory() {
  // Get initial memory status
  const initialMemory = await getMemoryStatus();
  if (initialMemory) {
    console.log(`\n📊 INITIAL MEMORY STATUS:`);
    console.log(`   Heap Used: ${initialMemory.heapUsed}MB`);
    console.log(`   Heap Total: ${initialMemory.heapTotal}MB`);
    console.log(`   Heap Usage: ${initialMemory.current?.heapUsedPercent}%`);
  }
  
  // Clear caches
  await clearCaches();
  
  // Force garbage collection by making many small requests
  console.log('\n🔄 TRIGGERING GARBAGE COLLECTION...');
  for (let i = 0; i < 5; i++) {
    await fetch('http://localhost:5000/api/health');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Get final memory status
  const finalMemory = await getMemoryStatus();
  if (finalMemory && initialMemory) {
    console.log(`\n📊 FINAL MEMORY STATUS:`);
    console.log(`   Heap Used: ${finalMemory.heapUsed}MB`);
    console.log(`   Heap Total: ${finalMemory.heapTotal}MB`);
    console.log(`   Heap Usage: ${finalMemory.current?.heapUsedPercent}%`);
    
    const freed = initialMemory.heapUsed - finalMemory.heapUsed;
    if (freed > 0) {
      console.log(`\n✅ MEMORY FREED: ${freed}MB`);
    } else {
      console.log(`\n⚠️ No significant memory freed`);
    }
  }
  
  // Recommendations
  console.log('\n🔧 IMMEDIATE ACTIONS NEEDED:');
  console.log('   1. Restart server with: pkill -f tsx && npm run dev');
  console.log('   2. Enable garbage collection: add --expose-gc flag');
  console.log('   3. Reduce cache sizes in code');
  console.log('   4. Implement streaming for large datasets');
  
  if (finalMemory?.current?.heapUsedPercent > 90) {
    console.log('\n🚨 CRITICAL: RESTART SERVER IMMEDIATELY!');
  }
}

// Run optimization
optimizeMemory().catch(console.error);