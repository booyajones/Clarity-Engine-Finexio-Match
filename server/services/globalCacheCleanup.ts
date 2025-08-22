/**
 * Global cache cleanup service
 * Aggressively manages all caches in the system to minimize memory usage
 */

import { LRUCache } from 'lru-cache';

// Global registry of all caches
const globalCaches = new Map<string, LRUCache<any, any>>();

// Register a cache
export function registerCache(name: string, cache: LRUCache<any, any>): void {
  globalCaches.set(name, cache);
  console.log(`📦 Registered cache: ${name}`);
}

// Clear all caches
export function clearAllCaches(): number {
  let totalCleared = 0;
  
  globalCaches.forEach((cache, name) => {
    const size = cache.size;
    if (size > 0) {
      cache.clear();
      totalCleared += size;
      console.log(`  ♻️ Cleared ${size} items from ${name}`);
    }
  });
  
  return totalCleared;
}

// Get total cache size
export function getTotalCacheSize(): number {
  let total = 0;
  globalCaches.forEach(cache => {
    total += cache.size;
  });
  return total;
}

// Reduce cache sizes
export function reduceCacheSizes(): void {
  globalCaches.forEach((cache, name) => {
    const currentMax = (cache as any).max;
    if (currentMax > 1) {
      const newMax = Math.max(1, Math.floor(currentMax * 0.5));
      (cache as any).max = newMax;
      console.log(`  📉 Reduced ${name} cache max from ${currentMax} to ${newMax}`);
    }
  });
}

// Emergency cleanup
export function emergencyCleanup(): void {
  console.log('🚨 EMERGENCY MEMORY CLEANUP');
  
  // Clear all caches
  const cleared = clearAllCaches();
  console.log(`  ✅ Cleared ${cleared} total cache items`);
  
  // Reduce future cache sizes
  reduceCacheSizes();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('  ✅ Forced garbage collection');
  }
  
  // Clear any global objects
  if (global.process && global.process.memoryUsage) {
    const mem = global.process.memoryUsage();
    console.log(`  📊 Memory: Heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
  }
}

// Auto cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

export function startAutoCleanup(intervalMs: number = 30000): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(() => {
    const mem = process.memoryUsage();
    const percentage = mem.heapUsed / mem.heapTotal;
    
    if (percentage > 0.7) {
      console.log(`⚠️ Memory at ${(percentage * 100).toFixed(1)}%, running auto cleanup...`);
      const cleared = clearAllCaches();
      if (cleared > 0) {
        console.log(`  ♻️ Auto-cleared ${cleared} cache items`);
      }
    }
  }, intervalMs);
  
  console.log(`🔄 Auto cleanup started (every ${intervalMs / 1000}s)`);
}

// Stop auto cleanup
export function stopAutoCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Auto cleanup stopped');
  }
}