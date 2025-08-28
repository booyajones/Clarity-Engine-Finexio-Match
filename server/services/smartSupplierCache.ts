import { db } from '../db';
import { cachedSuppliers } from '../../shared/schema';
import { sql, eq, and, or, like } from 'drizzle-orm';
import { BigQuery } from '@google-cloud/bigquery';
import { LRUCache } from 'lru-cache';

interface CachedSupplier {
  payeeId: string;
  payeeName: string;
  normalizedName: string;
  paymentType: string;
  confidence?: number;
}

export class SmartSupplierCache {
  private static instance: SmartSupplierCache;
  private memoryCache: LRUCache<string, CachedSupplier[]>;
  private bigquery: BigQuery | null = null;
  private isConnected = false;
  private lastSyncTime: Date | null = null;
  private syncInProgress = false;
  
  // Cache configuration
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly BATCH_SIZE = 1000;
  private readonly MAX_MEMORY_ITEMS = 10000;
  
  private constructor() {
    // Initialize in-memory LRU cache
    this.memoryCache = new LRUCache<string, CachedSupplier[]>({
      max: this.MAX_MEMORY_ITEMS,
      ttl: this.CACHE_TTL,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
    
    this.initializeBigQuery();
  }
  
  static getInstance(): SmartSupplierCache {
    if (!SmartSupplierCache.instance) {
      SmartSupplierCache.instance = new SmartSupplierCache();
    }
    return SmartSupplierCache.instance;
  }
  
  private initializeBigQuery() {
    try {
      const projectId = process.env.BIGQUERY_PROJECT_ID;
      const credentials = process.env.BIGQUERY_CREDENTIALS;
      
      if (!projectId || !credentials) {
        console.log('⚠️  SmartCache: BigQuery credentials not configured, using cached data only');
        return;
      }
      
      // Try to connect to BigQuery
      this.bigquery = new BigQuery({
        projectId: projectId,
        credentials: JSON.parse(credentials),
      });
      
      // Test connection with a simple query
      this.testBigQueryConnection();
    } catch (error) {
      console.error('⚠️  SmartCache: BigQuery initialization failed, using cached data only:', error);
      this.bigquery = null;
    }
  }
  
  private async testBigQueryConnection() {
    if (!this.bigquery) return;
    
    try {
      // Try FinexioPOC project first
      const testQuery = `
        SELECT COUNT(*) as count 
        FROM \`finexiopoc.SE_Enrichment.supplier\` 
        LIMIT 1
      `;
      
      await this.bigquery.query({ query: testQuery });
      this.isConnected = true;
      console.log('✅ SmartCache: Connected to BigQuery (finexiopoc project)');
      
      // Start background sync
      this.startBackgroundSync();
    } catch (error: any) {
      // If finexiopoc fails, try the configured project
      if (error.code === 403 || error.code === 404) {
        console.log('⚠️  SmartCache: Cannot access finexiopoc, trying configured project');
        this.isConnected = false;
      }
    }
  }
  
  private async startBackgroundSync() {
    if (this.syncInProgress || !this.isConnected) return;
    
    // Sync every hour
    setInterval(async () => {
      if (!this.syncInProgress) {
        await this.syncFromBigQuery();
      }
    }, 60 * 60 * 1000); // 1 hour
    
    // Initial sync
    await this.syncFromBigQuery();
  }
  
  async syncFromBigQuery(): Promise<number> {
    if (!this.bigquery || !this.isConnected || this.syncInProgress) {
      return 0;
    }
    
    this.syncInProgress = true;
    console.log('🔄 SmartCache: Starting BigQuery sync...');
    
    try {
      const query = `
        WITH distinct_suppliers AS (
          SELECT DISTINCT
            CAST(id AS STRING) as payee_id,
            name as payee_name,
            payment_type_c as payment_type,
            ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY id) as rn
          FROM \`finexiopoc.SE_Enrichment.supplier\`
          WHERE COALESCE(is_deleted, false) = false
            AND name IS NOT NULL
            AND LENGTH(TRIM(name)) > 0
        )
        SELECT payee_id, payee_name, payment_type
        FROM distinct_suppliers
        WHERE rn = 1
        ORDER BY payee_name
        LIMIT 200000
      `;
      
      const [rows] = await this.bigquery.query({ query });
      
      if (rows.length === 0) {
        console.log('⚠️  SmartCache: No suppliers found in BigQuery');
        return 0;
      }
      
      // Clear existing cache
      await db.delete(cachedSuppliers);
      
      // Insert in batches
      let inserted = 0;
      for (let i = 0; i < rows.length; i += this.BATCH_SIZE) {
        const batch = rows.slice(i, i + this.BATCH_SIZE);
        
        const suppliers = batch.map(row => ({
          payeeId: `BQ_${row.payee_id}_${Date.now()}`,
          payeeName: row.payee_name || '',
          normalizedName: (row.payee_name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
          paymentType: row.payment_type || 'CHECK',
        }));
        
        await db.insert(cachedSuppliers).values(suppliers);
        inserted += batch.length;
        
        if (inserted % 10000 === 0) {
          console.log(`  📦 SmartCache: Synced ${inserted} suppliers...`);
        }
      }
      
      this.lastSyncTime = new Date();
      console.log(`✅ SmartCache: Synced ${inserted} suppliers from BigQuery`);
      
      // Clear memory cache to force refresh
      this.memoryCache.clear();
      
      return inserted;
    } catch (error) {
      console.error('❌ SmartCache: BigQuery sync failed:', error);
      return 0;
    } finally {
      this.syncInProgress = false;
    }
  }
  
  async searchSuppliers(searchTerm: string, limit = 10): Promise<CachedSupplier[]> {
    const normalizedSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cacheKey = `search:${normalizedSearch}:${limit}`;
    
    // Check memory cache first
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Search in database
    try {
      const results = await db.select()
        .from(cachedSuppliers)
        .where(
          or(
            eq(cachedSuppliers.normalizedName, normalizedSearch),
            like(cachedSuppliers.normalizedName, `${normalizedSearch}%`),
            like(cachedSuppliers.payeeName, `%${searchTerm}%`)
          )
        )
        .limit(limit);
      
      // Convert results to proper type
      const typedResults: CachedSupplier[] = results.map(r => ({
        payeeId: r.payeeId,
        payeeName: r.payeeName,
        normalizedName: r.normalizedName || '',
        paymentType: r.paymentType || 'CHECK',
        confidence: undefined,
      }));
      
      // Store in memory cache
      this.memoryCache.set(cacheKey, typedResults);
      
      return typedResults;
    } catch (error) {
      console.error('SmartCache: Search error:', error);
      return [];
    }
  }
  
  async validateSupplier(payeeName: string): Promise<boolean> {
    // Check if supplier exists in cache
    const results = await this.searchSuppliers(payeeName, 1);
    return results.length > 0;
  }
  
  async getCacheStats() {
    const dbCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(cachedSuppliers);
    
    return {
      databaseRecords: dbCount[0]?.count || 0,
      memoryCacheSize: this.memoryCache.size,
      memoryCacheMax: this.MAX_MEMORY_ITEMS,
      isConnectedToBigQuery: this.isConnected,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
    };
  }
  
  async loadSampleData() {
    // Load some sample suppliers for testing when BigQuery is not available
    const sampleSuppliers = [
      { name: 'AMAZON WEB SERVICES', type: 'ACH' },
      { name: 'MICROSOFT CORPORATION', type: 'ACH' },
      { name: 'GOOGLE CLOUD PLATFORM', type: 'Card' },
      { name: 'APPLE INC', type: 'ACH' },
      { name: 'SALESFORCE', type: 'ACH' },
      { name: 'ORACLE CORPORATION', type: 'Wire' },
      { name: 'IBM CORPORATION', type: 'CHECK' },
      { name: 'ADOBE SYSTEMS', type: 'ACH' },
      { name: 'SAP SE', type: 'Wire' },
      { name: 'CISCO SYSTEMS', type: 'ACH' },
    ];
    
    const suppliers = sampleSuppliers.map((s, i) => ({
      payeeId: `SAMPLE_${i + 1}_${Date.now()}`,
      payeeName: s.name,
      normalizedName: s.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      paymentType: s.type,
    }));
    
    await db.insert(cachedSuppliers).values(suppliers);
    console.log('✅ SmartCache: Loaded sample data for testing');
    
    return suppliers.length;
  }
  
  clearMemoryCache() {
    this.memoryCache.clear();
    console.log('🧹 SmartCache: Memory cache cleared');
  }
}

// Export singleton instance
export const smartCache = SmartSupplierCache.getInstance();