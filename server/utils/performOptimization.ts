/**
 * Comprehensive Performance Optimization Script
 * Run this to immediately optimize memory and performance
 */

import { pool } from '../db';
import { memoryUsage } from 'process';
import { LRUCache } from 'lru-cache';

export async function performFullOptimization(): Promise<void> {
  console.log('🚀 Starting comprehensive optimization...');
  
  const startMemory = getMemoryStats();
  console.log(`📊 Initial memory: ${startMemory.heapUsed}MB/${startMemory.heapTotal}MB (${startMemory.percentage.toFixed(1)}%)`);
  
  // Step 1: Clear all caches
  await clearAllCaches();
  
  // Step 2: Optimize database connections
  await optimizeDatabasePool();
  
  // Step 3: Clear module cache
  clearModuleCache();
  
  // Step 4: Run garbage collection if available
  runGarbageCollection();
  
  // Step 5: Clear temporary data
  await clearTemporaryData();
  
  const endMemory = getMemoryStats();
  const reduction = startMemory.heapUsed - endMemory.heapUsed;
  console.log(`✅ Optimization complete!`);
  console.log(`📊 Final memory: ${endMemory.heapUsed}MB/${endMemory.heapTotal}MB (${endMemory.percentage.toFixed(1)}%)`);
  console.log(`💾 Memory freed: ${reduction}MB`);
}

function getMemoryStats() {
  const mem = memoryUsage();
  return {
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
    percentage: (mem.heapUsed / mem.heapTotal) * 100
  };
}

async function clearAllCaches(): Promise<void> {
  console.log('🗑️ Clearing all caches...');
  
  // Clear dashboard cache
  try {
    const dashboardCache = require('./routes/dashboard');
    if (dashboardCache.statsCache) {
      dashboardCache.statsCache.clear();
    }
  } catch (e) {
    // Cache not available
  }
  
  // Clear database cache
  try {
    const { databaseService } = require('./services/databaseService');
    databaseService.clearCache();
  } catch (e) {
    // Service not available
  }
  
  // Clear Mastercard cache
  try {
    const { mastercardApi } = require('./services/mastercardApi');
    if (mastercardApi && mastercardApi.clearCache) {
      mastercardApi.clearCache();
    }
  } catch (e) {
    // Service not available
  }
  
  console.log('✅ Caches cleared');
}

async function optimizeDatabasePool(): Promise<void> {
  console.log('🔧 Optimizing database connections...');
  
  try {
    // Force close idle connections
    const idleQuery = `
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = current_database() 
        AND state = 'idle' 
        AND state_change < current_timestamp - interval '1 minute'
    `;
    
    await pool.query(idleQuery);
    
    // Run VACUUM on key tables
    const tables = ['payee_classifications', 'payee_matches', 'upload_batches'];
    for (const table of tables) {
      try {
        await pool.query(`VACUUM ${table}`);
        console.log(`✅ Vacuumed table: ${table}`);
      } catch (e) {
        // Table might not exist
      }
    }
  } catch (error) {
    console.error('Database optimization error:', error);
  }
}

function clearModuleCache(): void {
  console.log('🧹 Clearing module cache...');
  
  const patterns = [
    '/services/cache',
    '/utils/logger',
    '/temp/',
    '/test/',
    '.spec.',
    '.test.'
  ];
  
  let cleared = 0;
  Object.keys(require.cache).forEach(key => {
    if (patterns.some(pattern => key.includes(pattern))) {
      delete require.cache[key];
      cleared++;
    }
  });
  
  console.log(`✅ Cleared ${cleared} cached modules`);
}

function runGarbageCollection(): void {
  if (global.gc) {
    console.log('♻️ Running garbage collection...');
    global.gc();
    console.log('✅ Garbage collection complete');
  } else {
    console.log('⚠️ Garbage collection not available (run with --expose-gc)');
  }
}

async function clearTemporaryData(): Promise<void> {
  console.log('🗑️ Clearing temporary data...');
  
  try {
    // Clear old sessions
    await pool.query(`
      DELETE FROM sessions 
      WHERE expire < NOW() - INTERVAL '1 day'
    `);
    
    // Clear old temporary records
    await pool.query(`
      DELETE FROM mastercard_search_requests 
      WHERE created_at < NOW() - INTERVAL '7 days' 
        AND status IN ('completed', 'failed')
    `);
    
    console.log('✅ Temporary data cleared');
  } catch (e) {
    // Tables might not exist
  }
}

// Auto-run optimization if memory is critical
export function setupAutoOptimization(): void {
  setInterval(() => {
    const stats = getMemoryStats();
    if (stats.percentage > 90) {
      console.log('🚨 Critical memory usage detected, running optimization...');
      performFullOptimization().catch(console.error);
    }
  }, 60000); // Check every minute
}

// Export for use in other modules
export default {
  performFullOptimization,
  setupAutoOptimization,
  getMemoryStats
};