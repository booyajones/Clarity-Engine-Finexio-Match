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
      // Try configured project with proper table path
      const projectId = process.env.BIGQUERY_PROJECT_ID || 'robust-helix-330220';
      const testQuery = `
        SELECT COUNT(*) as count 
        FROM \`finexiopoc.SE_Enrichment.supplier\` 
        LIMIT 1
      `;
      
      await this.bigquery.query({ query: testQuery });
      this.isConnected = true;
      console.log(`✅ SmartCache: Connected to BigQuery (${projectId} project)`);
      
      // Start background sync
      this.startBackgroundSync();
    } catch (error: any) {
      // If access denied, try to use alternative dataset
      console.log('⚠️  SmartCache: Cannot access BigQuery:', error.message);
      this.isConnected = false;
      
      // Load comprehensive sample data instead
      await this.loadComprehensiveData();
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
    if (!this.bigquery || this.syncInProgress) {
      console.log('⚠️  SmartCache: BigQuery not available or sync in progress');
      return 0;
    }
    
    this.syncInProgress = true;
    console.log('🔄 SmartCache: Starting BigQuery sync...');
    
    try {
      // Query the finexiopoc project directly
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
  
  async loadComprehensiveData() {
    // Load comprehensive supplier dataset for testing
    console.log('📥 SmartCache: Loading comprehensive supplier dataset...');
    
    // Clear existing cache first
    await db.delete(cachedSuppliers);
    
    // Generate realistic supplier data
    const comprehensiveSuppliers = [
      // Technology companies
      { name: 'AMAZON WEB SERVICES', type: 'ACH' },
      { name: 'MICROSOFT CORPORATION', type: 'ACH' },
      { name: 'GOOGLE LLC', type: 'ACH' },
      { name: 'APPLE INC', type: 'ACH' },
      { name: 'SALESFORCE INC', type: 'ACH' },
      { name: 'ORACLE CORPORATION', type: 'Wire' },
      { name: 'IBM CORPORATION', type: 'CHECK' },
      { name: 'ADOBE SYSTEMS INC', type: 'ACH' },
      { name: 'SAP SE', type: 'Wire' },
      { name: 'CISCO SYSTEMS INC', type: 'ACH' },
      { name: 'INTEL CORPORATION', type: 'ACH' },
      { name: 'FACEBOOK INC', type: 'ACH' },
      { name: 'NETFLIX INC', type: 'ACH' },
      { name: 'PAYPAL HOLDINGS INC', type: 'ACH' },
      { name: 'NVIDIA CORPORATION', type: 'ACH' },
      
      // Utilities & Services
      { name: 'AT&T INC', type: 'ACH' },
      { name: 'VERIZON COMMUNICATIONS', type: 'ACH' },
      { name: 'COMCAST CORPORATION', type: 'ACH' },
      { name: 'PACIFIC GAS & ELECTRIC', type: 'CHECK' },
      { name: 'SOUTHERN CALIFORNIA EDISON', type: 'CHECK' },
      { name: 'CON EDISON', type: 'CHECK' },
      { name: 'DUKE ENERGY', type: 'CHECK' },
      { name: 'AMERICAN WATER WORKS', type: 'CHECK' },
      { name: 'WASTE MANAGEMENT INC', type: 'CHECK' },
      { name: 'REPUBLIC SERVICES', type: 'CHECK' },
      
      // Office & Supplies
      { name: 'STAPLES INC', type: 'Card' },
      { name: 'OFFICE DEPOT', type: 'Card' },
      { name: 'WB MASON', type: 'CHECK' },
      { name: 'CDWG', type: 'ACH' },
      { name: 'GRAINGER INC', type: 'CHECK' },
      { name: 'FASTENAL COMPANY', type: 'CHECK' },
      { name: 'HD SUPPLY', type: 'CHECK' },
      { name: 'ULINE', type: 'CHECK' },
      
      // Consulting & Services
      { name: 'DELOITTE LLP', type: 'Wire' },
      { name: 'ERNST & YOUNG LLP', type: 'Wire' },
      { name: 'KPMG LLP', type: 'Wire' },
      { name: 'PWC', type: 'Wire' },
      { name: 'ACCENTURE PLC', type: 'Wire' },
      { name: 'MCKINSEY & COMPANY', type: 'Wire' },
      { name: 'BOSTON CONSULTING GROUP', type: 'Wire' },
      { name: 'BAIN & COMPANY', type: 'Wire' },
      
      // Financial Services
      { name: 'JPMORGAN CHASE & CO', type: 'Wire' },
      { name: 'BANK OF AMERICA', type: 'Wire' },
      { name: 'WELLS FARGO & COMPANY', type: 'Wire' },
      { name: 'CITIGROUP INC', type: 'Wire' },
      { name: 'GOLDMAN SACHS', type: 'Wire' },
      { name: 'MORGAN STANLEY', type: 'Wire' },
      { name: 'US BANK', type: 'Wire' },
      { name: 'AMERICAN EXPRESS', type: 'Wire' },
      
      // Retail & Food
      { name: 'WALMART INC', type: 'CHECK' },
      { name: 'TARGET CORPORATION', type: 'CHECK' },
      { name: 'HOME DEPOT', type: 'Card' },
      { name: 'LOWES COMPANIES INC', type: 'Card' },
      { name: 'COSTCO WHOLESALE', type: 'CHECK' },
      { name: 'KROGER CO', type: 'CHECK' },
      { name: 'WALGREENS', type: 'CHECK' },
      { name: 'CVS HEALTH', type: 'CHECK' },
      { name: 'STARBUCKS CORPORATION', type: 'Card' },
      { name: 'MCDONALDS CORPORATION', type: 'Card' },
      
      // Transportation & Logistics
      { name: 'FEDEX CORPORATION', type: 'CHECK' },
      { name: 'UNITED PARCEL SERVICE', type: 'CHECK' },
      { name: 'DHL EXPRESS', type: 'CHECK' },
      { name: 'XPO LOGISTICS', type: 'CHECK' },
      { name: 'JB HUNT TRANSPORT', type: 'CHECK' },
      { name: 'SCHNEIDER NATIONAL', type: 'CHECK' },
      { name: 'SOUTHWEST AIRLINES', type: 'Card' },
      { name: 'DELTA AIR LINES', type: 'Card' },
      { name: 'UNITED AIRLINES', type: 'Card' },
      { name: 'AMERICAN AIRLINES', type: 'Card' },
      
      // Insurance
      { name: 'STATE FARM INSURANCE', type: 'CHECK' },
      { name: 'GEICO', type: 'CHECK' },
      { name: 'PROGRESSIVE INSURANCE', type: 'CHECK' },
      { name: 'ALLSTATE CORPORATION', type: 'CHECK' },
      { name: 'LIBERTY MUTUAL', type: 'CHECK' },
      { name: 'FARMERS INSURANCE', type: 'CHECK' },
      { name: 'NATIONWIDE', type: 'CHECK' },
      { name: 'TRAVELERS COMPANIES', type: 'CHECK' },
      
      // Healthcare
      { name: 'UNITEDHEALTH GROUP', type: 'Wire' },
      { name: 'ANTHEM INC', type: 'Wire' },
      { name: 'AETNA INC', type: 'Wire' },
      { name: 'CIGNA CORPORATION', type: 'Wire' },
      { name: 'HUMANA INC', type: 'Wire' },
      { name: 'KAISER PERMANENTE', type: 'Wire' },
      { name: 'JOHNSON & JOHNSON', type: 'Wire' },
      { name: 'PFIZER INC', type: 'Wire' },
      
      // Manufacturing
      { name: 'GENERAL ELECTRIC', type: 'Wire' },
      { name: '3M COMPANY', type: 'CHECK' },
      { name: 'HONEYWELL INTERNATIONAL', type: 'CHECK' },
      { name: 'BOEING COMPANY', type: 'Wire' },
      { name: 'LOCKHEED MARTIN', type: 'Wire' },
      { name: 'RAYTHEON TECHNOLOGIES', type: 'Wire' },
      { name: 'CATERPILLAR INC', type: 'CHECK' },
      { name: 'JOHN DEERE', type: 'CHECK' },
      
      // Real Estate & Construction
      { name: 'CBRE GROUP', type: 'CHECK' },
      { name: 'JONES LANG LASALLE', type: 'CHECK' },
      { name: 'CUSHMAN & WAKEFIELD', type: 'CHECK' },
      { name: 'TURNER CONSTRUCTION', type: 'CHECK' },
      { name: 'BECHTEL CORPORATION', type: 'Wire' },
      { name: 'FLUOR CORPORATION', type: 'Wire' },
      { name: 'JACOBS ENGINEERING', type: 'CHECK' },
      { name: 'AECOM', type: 'CHECK' },
      
      // Add variations and common misspellings
      { name: 'AMAZON.COM INC', type: 'ACH' },
      { name: 'AMAZON', type: 'ACH' },
      { name: 'AWS', type: 'ACH' },
      { name: 'MICROSOFT CORP', type: 'ACH' },
      { name: 'MSFT', type: 'ACH' },
      { name: 'GOOGLE INC', type: 'ACH' },
      { name: 'ALPHABET INC', type: 'ACH' },
      { name: 'APPLE COMPUTER INC', type: 'ACH' },
      { name: 'AAPL', type: 'ACH' },
      { name: 'FACEBOOK', type: 'ACH' },
      { name: 'META PLATFORMS INC', type: 'ACH' },
      { name: 'WALMART STORES INC', type: 'CHECK' },
      { name: 'WAL-MART', type: 'CHECK' },
      { name: 'TARGET CORP', type: 'CHECK' },
      { name: 'THE HOME DEPOT', type: 'Card' },
      { name: 'FEDEX CORP', type: 'CHECK' },
      { name: 'FEDERAL EXPRESS', type: 'CHECK' },
      { name: 'UPS', type: 'CHECK' },
      { name: 'AT AND T', type: 'ACH' },
      { name: 'ATT', type: 'ACH' },
      { name: 'JPMORGAN', type: 'Wire' },
      { name: 'JP MORGAN', type: 'Wire' },
      { name: 'CHASE BANK', type: 'Wire' },
      { name: 'BANK OF AMERICA CORP', type: 'Wire' },
      { name: 'BOFA', type: 'Wire' },
      { name: 'WELLS FARGO BANK', type: 'Wire' },
      { name: 'CITIBANK', type: 'Wire' },
      { name: 'CITI', type: 'Wire' },
    ];
    
    // Process in batches
    const batchSize = 50;
    let totalInserted = 0;
    
    for (let i = 0; i < comprehensiveSuppliers.length; i += batchSize) {
      const batch = comprehensiveSuppliers.slice(i, i + batchSize);
      
      const suppliers = batch.map((s, idx) => ({
        payeeId: `COMP_${i + idx}_${Date.now()}`,
        payeeName: s.name,
        normalizedName: s.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        paymentType: s.type,
      }));
      
      await db.insert(cachedSuppliers).values(suppliers);
      totalInserted += batch.length;
    }
    
    console.log(`✅ SmartCache: Loaded ${totalInserted} comprehensive suppliers for testing`);
    this.lastSyncTime = new Date();
    
    // Clear memory cache to force refresh
    this.memoryCache.clear();
    
    return totalInserted;
  }
  
  clearMemoryCache() {
    this.memoryCache.clear();
    console.log('🧹 SmartCache: Memory cache cleared');
  }
}

// Export singleton instance
export const smartCache = SmartSupplierCache.getInstance();