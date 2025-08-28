import { db } from '../db';
import { cachedSuppliers, payeeClassifications } from '@shared/schema';
import { eq, or, like, sql, and, inArray, desc } from 'drizzle-orm';
import pLimit from 'p-limit';

// Normalized matching with similarity search
export class OptimizedFinexioMatchingV2 {
  private matchLimit = pLimit(40); // Concurrent DB lookups
  private cache = new Map<string, any>();
  private readonly MAX_CACHE_SIZE = 10000;

  // Normalize company name for matching
  private normalizeCompanyName(name: string): string {
    if (!name) return '';
    
    // Remove special characters, keep alphanumeric and spaces
    let normalized = name.toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove common suffixes
    normalized = normalized
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|limited|incorporated)\b\.?/gi, '')
      .trim();
    
    return normalized;
  }

  // Use trigram similarity search for fast candidate retrieval
  async findBestCandidates(payeeName: string, limit: number = 10) {
    const normalized = this.normalizeCompanyName(payeeName);
    if (!normalized) return [];
    
    try {
      // Use similarity search with trigram index
      const candidates = await db.execute(sql`
        SELECT 
          id,
          payee_name,
          mastercard_business_name,
          supplier_type,
          payment_method,
          city,
          state,
          country,
          similarity(lower(payee_name), ${normalized}) AS payee_score,
          similarity(COALESCE(lower(mastercard_business_name), ''), ${normalized}) AS mc_score
        FROM cached_suppliers
        WHERE 
          lower(payee_name) % ${normalized}  -- Trigram similarity operator
          OR (mastercard_business_name IS NOT NULL 
              AND lower(mastercard_business_name) % ${normalized})
        ORDER BY 
          GREATEST(
            similarity(lower(payee_name), ${normalized}),
            similarity(COALESCE(lower(mastercard_business_name), ''), ${normalized})
          ) DESC
        LIMIT ${limit}
      `);
      
      return candidates.rows || [];
    } catch (error) {
      console.error('Error in similarity search:', error);
      // Fallback to exact match if trigram fails
      return this.exactMatchFallback(normalized);
    }
  }

  // Fallback for exact matches if similarity search fails
  async exactMatchFallback(normalized: string) {
    try {
      return await db.select()
        .from(cachedSuppliers)
        .where(
          or(
            eq(sql`lower(payee_name)`, normalized),
            eq(sql`lower(mastercard_business_name)`, normalized)
          )
        )
        .limit(1);
    } catch (error) {
      console.error('Exact match fallback error:', error);
      return [];
    }
  }

  // Score a candidate match
  private scoreMatch(payeeName: string, candidate: any): number {
    const normalized = this.normalizeCompanyName(payeeName);
    const candidateNorm = this.normalizeCompanyName(candidate.payee_name);
    const mcNorm = this.normalizeCompanyName(candidate.mastercard_business_name || '');
    
    // Use the database-calculated similarity scores if available
    let score = 0;
    if (candidate.payee_score) {
      score = Math.max(score, candidate.payee_score);
    }
    if (candidate.mc_score && candidate.mc_score > 0) {
      score = Math.max(score, candidate.mc_score);
    }
    
    // Exact match bonus
    if (candidateNorm === normalized || mcNorm === normalized) {
      score = 1.0;
    }
    
    return score;
  }

  // Main matching function for a single payee
  async matchSingle(payeeName: string, options: any = {}) {
    // Check cache first
    const cacheKey = `${payeeName}_${JSON.stringify(options)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Find best candidates using similarity search
    const candidates = await this.findBestCandidates(payeeName, 10);
    
    if (candidates.length === 0) {
      const result = {
        matched: false,
        confidence: 0,
        supplierData: null
      };
      this.addToCache(cacheKey, result);
      return result;
    }
    
    // Score all candidates and pick the best
    let bestMatch = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const score = this.scoreMatch(payeeName, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
      
      // Early exit on perfect match
      if (score >= 0.99) {
        break;
      }
    }
    
    const result = {
      matched: bestScore >= 0.75, // 75% confidence threshold
      confidence: bestScore,
      supplierData: bestMatch,
      matchType: bestScore >= 0.99 ? 'exact' : 
                 bestScore >= 0.90 ? 'high' :
                 bestScore >= 0.75 ? 'medium' : 'low'
    };
    
    this.addToCache(cacheKey, result);
    return result;
  }

  // Batch matching with concurrency control
  async batchMatch(payeeNames: string[], options: any = {}) {
    const tasks = payeeNames.map(name => 
      this.matchLimit(() => this.matchSingle(name, options))
    );
    
    return Promise.all(tasks);
  }

  // Process a chunk of records
  async processChunk(records: any[], batchId: number) {
    const payeeNames = records.map(r => r.originalName || r.payee_name);
    const matches = await this.batchMatch(payeeNames);
    
    // Prepare results for database insertion
    const results = records.map((record, i) => ({
      batchId,
      payeeId: record.id,
      originalName: payeeNames[i],
      matched: matches[i].matched,
      confidence: matches[i].confidence,
      matchType: matches[i].matchType || 'none',
      supplierData: matches[i].supplierData ? JSON.stringify({
        id: matches[i].supplierData.id,
        name: matches[i].supplierData.payee_name,
        type: matches[i].supplierData.supplier_type,
        paymentMethod: matches[i].supplierData.payment_method
      }) : null
    }));
    
    // Batch insert results
    if (results.length > 0) {
      await this.saveResults(results);
    }
    
    return results;
  }

  // Save results to database by updating payee classifications
  async saveResults(results: any[]) {
    if (results.length === 0) return;
    
    try {
      // Update each classification with Finexio match data
      for (const result of results) {
        if (result.matched && result.supplierData) {
          const supplierInfo = typeof result.supplierData === 'string' 
            ? JSON.parse(result.supplierData) 
            : result.supplierData;
          
          await db.update(payeeClassifications)
            .set({
              finexioSupplierId: String(supplierInfo.id),
              finexioSupplierName: supplierInfo.name,
              finexioConfidence: result.confidence,
              finexioMatchType: result.matchType,
              finexioPaymentMethod: supplierInfo.paymentMethod
            })
            .where(eq(payeeClassifications.id, result.payeeId));
        }
      }
    } catch (error) {
      console.error('Error saving match results:', error);
    }
  }

  // Cache management
  private addToCache(key: string, value: any) {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entries (FIFO)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    if (global.gc) {
      global.gc();
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0 // Would need to track hits/misses for real stats
    };
  }
}

// Export singleton instance
export const finexioMatcherV2 = new OptimizedFinexioMatchingV2();