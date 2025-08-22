/**
 * Centralized Database Service
 * Manages all database queries and connections efficiently
 */

import { pool } from '../db';
import { LRUCache } from 'lru-cache';

// Query result cache to reduce database load
const queryCache = new LRUCache<string, { data: any; timestamp: number }>({
  max: 20, // Reduced to optimize memory
  ttl: 300000, // 5 minutes
  allowStale: true,
  updateAgeOnGet: true,
  dispose: (value, key) => {
    console.log(`♻️ Evicting database cache entry: ${key.substring(0, 50)}...`);
  }
});

// Note: Memory manager registration happens in the manager itself
// to avoid circular dependencies in ES modules

export class DatabaseService {
  private static instance: DatabaseService;
  
  private constructor() {
    // Private constructor for singleton
  }
  
  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }
  
  /**
   * Execute a query with automatic caching
   */
  async query<T = any>(sql: string, params?: any[], options?: { cache?: boolean; cacheKey?: string }): Promise<T> {
    const cacheKey = options?.cacheKey || this.generateCacheKey(sql, params);
    
    // Check cache first if caching is enabled
    if (options?.cache !== false) {
      const cached = queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        console.log(`📊 Cache hit for query: ${cacheKey.substring(0, 50)}...`);
        return cached.data;
      }
    }
    
    try {
      console.log(`🔍 Executing query: ${sql.substring(0, 100)}...`);
      const result = await pool.query(sql, params);
      
      // Cache the result
      if (options?.cache !== false) {
        queryCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }
      
      return result as T;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }
  
  /**
   * Get dashboard statistics with optimized queries
   */
  async getDashboardStats() {
    // Execute all queries in parallel with caching
    const [supplierCount, finexioStats, googleStats] = await Promise.all([
      this.getCachedSupplierCount(),
      this.getFinexioMatchStats(),
      this.getGoogleValidationStats()
    ]);
    
    return {
      supplierCount,
      finexioStats,
      googleStats
    };
  }
  
  /**
   * Get cached supplier count
   */
  private async getCachedSupplierCount() {
    const result = await this.query(
      'SELECT COUNT(*) as count FROM cached_suppliers',
      [],
      { cache: true, cacheKey: 'supplier-count' }
    );
    return parseInt(result.rows[0].count) || 0;
  }
  
  /**
   * Get Finexio match statistics
   */
  private async getFinexioMatchStats() {
    const result = await this.query(`
      WITH recent_classifications AS (
        SELECT pc.id
        FROM payee_classifications pc
        JOIN upload_batches ub ON pc.batch_id = ub.id
        WHERE ub.status = 'completed'
        ORDER BY ub.created_at DESC
        LIMIT 50
      )
      SELECT 
        COUNT(DISTINCT pm.classification_id) as total_matched,
        COUNT(DISTINCT rc.id) as total_classifications,
        AVG(pm.finexio_match_score) as avg_score
      FROM recent_classifications rc
      LEFT JOIN payee_matches pm ON pm.classification_id = rc.id AND pm.finexio_match_score > 0
    `, [], { cache: true, cacheKey: 'finexio-stats' });
    
    const totalClassifications = parseInt(result.rows[0].total_classifications) || 0;
    const totalMatched = parseInt(result.rows[0].total_matched) || 0;
    const matchRate = totalClassifications > 0 ? 
      Math.round((totalMatched / totalClassifications) * 100) : 0;
    
    return {
      matchRate,
      totalMatches: totalMatched,
      avgScore: parseFloat(result.rows[0].avg_score) || 0
    };
  }
  
  /**
   * Get Google address validation statistics
   */
  private async getGoogleValidationStats() {
    const result = await this.query(`
      WITH recent_classifications AS (
        SELECT pc.*
        FROM payee_classifications pc
        JOIN upload_batches ub ON pc.batch_id = ub.id
        WHERE ub.status = 'completed'
        ORDER BY ub.created_at DESC
        LIMIT 100
      )
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN google_address_validation_status = 'validated' THEN 1 END) as validated,
        COUNT(CASE WHEN google_address_validation_status IS NOT NULL THEN 1 END) as attempted,
        AVG(CASE WHEN google_address_confidence IS NOT NULL THEN google_address_confidence END) as avg_confidence
      FROM recent_classifications
    `, [], { cache: true, cacheKey: 'google-stats' });
    
    const total = parseInt(result.rows[0].total_records) || 0;
    const validated = parseInt(result.rows[0].validated) || 0;
    const attempted = parseInt(result.rows[0].attempted) || 0;
    const avgConfidence = parseFloat(result.rows[0].avg_confidence) || 0;
    const validationRate = total > 0 ? Math.round((validated / total) * 100) : 0;
    
    return {
      validationRate,
      totalValidated: validated,
      totalAttempted: attempted,
      avgConfidence: Math.round(avgConfidence * 100)
    };
  }
  
  /**
   * Clear query cache
   */
  clearCache(key?: string) {
    if (key) {
      queryCache.delete(key);
    } else {
      queryCache.clear();
    }
    console.log(`🗑️ Cleared database query cache${key ? ` for key: ${key}` : ''}`);
  }
  
  /**
   * Generate cache key from query and params
   */
  private generateCacheKey(sql: string, params?: any[]): string {
    const queryHash = sql.replace(/\s+/g, ' ').trim();
    const paramsHash = params ? JSON.stringify(params) : '';
    return `${queryHash}-${paramsHash}`;
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: queryCache.size,
      maxSize: queryCache.max,
      keys: Array.from(queryCache.keys())
    };
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();