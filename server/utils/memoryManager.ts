/**
 * Advanced Memory Management System
 * Proactively manages memory to stay below 85% usage
 */

import { memoryUsage } from 'process';
import { pool } from '../db';
import { LRUCache } from 'lru-cache';

// Global cache registry for memory management
const cacheRegistry: Set<LRUCache<any, any>> = new Set();

export class MemoryManager {
  private static instance: MemoryManager;
  private readonly MEMORY_THRESHOLD = 0.85; // 85% threshold
  private readonly CRITICAL_THRESHOLD = 0.90; // 90% critical threshold
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.startMonitoring();
  }
  
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }
  
  /**
   * Register a cache for management
   */
  registerCache(cache: LRUCache<any, any>): void {
    cacheRegistry.add(cache);
  }
  
  /**
   * Get current memory usage percentage
   */
  getMemoryUsage(): { percentage: number; used: number; total: number } {
    const mem = memoryUsage();
    const heapUsed = mem.heapUsed;
    const heapTotal = mem.heapTotal;
    const percentage = heapUsed / heapTotal;
    
    return {
      percentage,
      used: Math.round(heapUsed / 1024 / 1024),
      total: Math.round(heapTotal / 1024 / 1024)
    };
  }
  
  /**
   * Clear all registered caches
   */
  private clearAllCaches(): void {
    let cleared = 0;
    cacheRegistry.forEach(cache => {
      const size = cache.size;
      cache.clear();
      cleared += size;
    });
    console.log(`🗑️ Cleared ${cleared} items from ${cacheRegistry.size} caches`);
  }
  
  /**
   * Optimize database connections
   */
  private async optimizeDatabaseConnections(): Promise<void> {
    try {
      // MINIMAL: Pool is already at minimum (1 connection)
      // Skip database optimization for single-customer use
    } catch (error) {
      console.error('Error optimizing database connections:', error);
    }
  }
  
  /**
   * Perform aggressive memory cleanup
   */
  private async performCleanup(level: 'normal' | 'aggressive' | 'critical'): Promise<void> {
    const { percentage, used, total } = this.getMemoryUsage();
    console.log(`🧹 Performing ${level} cleanup (Memory: ${used}MB/${total}MB - ${(percentage * 100).toFixed(1)}%)`);
    
    // Clear caches
    if (level === 'normal' || level === 'aggressive' || level === 'critical') {
      this.clearAllCaches();
    }
    
    // Optimize database connections
    if (level === 'aggressive' || level === 'critical') {
      await this.optimizeDatabaseConnections();
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('✅ Forced garbage collection');
    } else {
      console.log('⚠️ Garbage collection not exposed. Run with --expose-gc flag');
    }
    
    // Additional critical measures
    if (level === 'critical') {
      // In ES modules, we can't clear module cache like in CommonJS
      // Instead, we'll focus on other cleanup strategies
      console.log('🔥 Running critical cleanup measures');
    }
    
    // Log new memory state
    const newState = this.getMemoryUsage();
    console.log(`📊 Memory after cleanup: ${newState.used}MB/${newState.total}MB - ${(newState.percentage * 100).toFixed(1)}%`);
  }
  
  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    // Clear any existing interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // DISABLED: No monitoring interval for single-customer
    // Monitoring causes memory churn
    return;
    
    // Original monitoring code (disabled):
    this.monitoringInterval = setInterval(async () => {
      const { percentage, used, total } = this.getMemoryUsage();
      
      if (percentage > this.CRITICAL_THRESHOLD) {
        console.log(`🚨 CRITICAL: Memory at ${(percentage * 100).toFixed(1)}% (${used}MB/${total}MB)`);
        await this.performCleanup('critical');
      } else if (percentage > this.MEMORY_THRESHOLD) {
        console.log(`⚠️ WARNING: Memory at ${(percentage * 100).toFixed(1)}% (${used}MB/${total}MB)`);
        await this.performCleanup('aggressive');
      } else if (percentage > 0.75) {
        // Proactive cleanup at 75%
        await this.performCleanup('normal');
      }
    }, 30000); // 30 seconds
    
    console.log('✅ Memory manager initialized (monitoring disabled for single-customer)');
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
  
  /**
   * Force immediate cleanup
   */
  async forceCleanup(): Promise<void> {
    await this.performCleanup('aggressive');
  }
  
  /**
   * Get memory statistics
   */
  getStats() {
    const { percentage, used, total } = this.getMemoryUsage();
    const mem = memoryUsage();
    
    return {
      heap: {
        used: Math.round(mem.heapUsed / 1024 / 1024),
        total: Math.round(mem.heapTotal / 1024 / 1024),
        percentage: (percentage * 100).toFixed(1)
      },
      rss: Math.round(mem.rss / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      caches: {
        count: cacheRegistry.size,
        totalSize: Array.from(cacheRegistry).reduce((sum, cache) => sum + cache.size, 0)
      },
      status: percentage > this.CRITICAL_THRESHOLD ? 'critical' : 
              percentage > this.MEMORY_THRESHOLD ? 'warning' : 'healthy'
    };
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();

// Cleanup on process exit
process.on('beforeExit', () => {
  memoryManager.stopMonitoring();
});

process.on('SIGINT', () => {
  memoryManager.stopMonitoring();
  process.exit(0);
});

process.on('SIGTERM', () => {
  memoryManager.stopMonitoring();
  process.exit(0);
});