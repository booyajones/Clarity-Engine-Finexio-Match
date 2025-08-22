import { LRUCache } from 'lru-cache';

interface CachedStats {
  data: any;
  timestamp: number;
}

class DashboardCacheService {
  private cache: LRUCache<string, CachedStats>;
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of cached items

  constructor() {
    this.cache = new LRUCache<string, CachedStats>({
      max: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL,
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    });
  }

  /**
   * Get cached dashboard stats
   */
  async getStats(key: string, fetchFunction: () => Promise<any>): Promise<any> {
    // Check if we have valid cached data
    const cached = this.cache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log(`📊 Cache hit for dashboard stats: ${key}`);
      return cached.data;
    }

    // Fetch new data
    console.log(`📊 Cache miss for dashboard stats: ${key}, fetching fresh data...`);
    try {
      const freshData = await fetchFunction();
      
      // Cache the result
      this.cache.set(key, {
        data: freshData,
        timestamp: Date.now()
      });

      return freshData;
    } catch (error) {
      // If fetch fails and we have stale data, return it
      if (cached) {
        console.log(`⚠️ Fetch failed, returning stale cached data for ${key}`);
        return cached.data;
      }
      throw error;
    }
  }

  /**
   * Invalidate cached stats
   */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      console.log(`🗑️ Invalidated cache for: ${key}`);
    } else {
      this.cache.clear();
      console.log(`🗑️ Cleared entire dashboard cache`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const size = this.cache.size;
    // LRUCache doesn't track hits/misses by default, so we'll return basic info
    return {
      size,
      hits: 0, // Would need to implement tracking
      misses: 0,
      hitRate: 0
    };
  }

  /**
   * Clean up old entries manually
   */
  cleanup(): void {
    // LRUCache handles this automatically with TTL
    // But we can force cleanup of expired items
    this.cache.purgeStale();
    console.log(`🧹 Cleaned up stale dashboard cache entries`);
  }
}

// Export singleton instance
export const dashboardCache = new DashboardCacheService();