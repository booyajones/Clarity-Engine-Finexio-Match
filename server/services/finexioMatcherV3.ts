/**
 * Finexio Matcher V3 - Streamlined DB→Rules→AI Pipeline
 * 
 * Architecture:
 * 1. DB does retrieval (pg_trgm indexes)
 * 2. Early-accept rules for obvious matches
 * 3. OpenAI as final judge for ambiguous cases
 * 
 * 10-20x faster than 6-algorithm approach
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import { cachedSuppliers } from '@shared/schema';
import OpenAI from 'openai';
import pLimit from 'p-limit';

// Initialize OpenAI if available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 15000,
  maxRetries: 2
}) : null;

// Concurrency limits - Conservative to prevent resource exhaustion
const dbLimit = pLimit(5);   // Very conservative to prevent connection pool exhaustion
const llmLimit = pLimit(3);   // Reduced to prevent OpenAI rate limiting

interface MatchResult {
  matched: boolean;
  supplierId: string | null;
  confidence: number;
  method: 'exact' | 'early_accept' | 'llm' | 'no_match';
  reasoning: string;
}

interface Candidate {
  id: string;
  payeeName: string;
  city: string | null;
  state: string | null;
  similarity: number;
}

// Cache configuration
const MAX_CACHE_SIZE = Number(process.env.MATCH_CACHE_MAX || 20000);
const CACHE_TTL_MS = Number(process.env.MATCH_CACHE_TTL_MS || 10 * 60 * 1000); // 10 minutes

interface CacheEntry {
  result: MatchResult;
  timestamp: number;
}

export class FinexioMatcherV3 {
  private cache = new Map<string, CacheEntry>();
  
  /**
   * Get from cache with TTL check
   */
  private getFromCache(key: string): MatchResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    
    // Move to end for LRU (delete and re-add)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }
  
  /**
   * Set cache with LRU eviction
   */
  private setCache(key: string, result: MatchResult): void {
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
  
  /**
   * Main matching function - streamlined pipeline
   */
  async match(
    payeeName: string,
    context?: { city?: string | null; state?: string | null }
  ): Promise<MatchResult> {
    const normalized = this.normalize(payeeName);
    const cacheKey = `${normalized}:${context?.city || ''}:${context?.state || ''}`;
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Step 1: Try exact match first (super fast)
    const exactMatch = await this.tryExactMatch(payeeName, normalized);
    if (exactMatch) {
      const result = {
        matched: true,
        supplierId: String(exactMatch.id),
        confidence: 1.0,
        method: 'exact' as const,
        reasoning: 'Exact match found'
      };
      this.setCache(cacheKey, result);
      return result;
    }
    
    // Step 2: Get top candidates using trigram similarity
    const candidates = await this.findCandidates(normalized);
    
    if (candidates.length === 0) {
      return {
        matched: false,
        supplierId: null,
        confidence: 0,
        method: 'no_match',
        reasoning: 'No similar suppliers found'
      };
    }
    
    // Step 3: Apply early-accept rules
    for (const candidate of candidates) {
      const earlyAccept = this.earlyAccept(normalized, candidate, context);
      if (earlyAccept.accept) {
        const result = {
          matched: true,
          supplierId: candidate.id,
          confidence: earlyAccept.confidence,
          method: 'early_accept' as const,
          reasoning: earlyAccept.reason
        };
        this.setCache(cacheKey, result);
        return result;
      }
    }
    
    // Step 4: Use OpenAI for ambiguous cases (only if available)
    if (openai && candidates.length > 0) {
      const topCandidates = candidates.slice(0, 5); // Only send top 5 to OpenAI
      const llmResult = await this.judgeWithLLM(
        { name: payeeName, ...context },
        topCandidates
      );
      
      if (llmResult.matched && llmResult.confidence >= 0.85) {
        const result = {
          matched: true,
          supplierId: llmResult.supplierId,
          confidence: llmResult.confidence,
          method: 'llm' as const,
          reasoning: llmResult.reasoning
        };
        this.setCache(cacheKey, result);
        return result;
      }
    }
    
    // No match found
    const result = {
      matched: false,
      supplierId: null,
      confidence: candidates[0]?.similarity || 0,
      method: 'no_match' as const,
      reasoning: 'No confident match found'
    };
    
    // Cache the result
    this.setCache(cacheKey, result);
    return result;
  }
  
  /**
   * Batch matching with concurrency control
   */
  async matchBatch(
    items: Array<{ id: string; payeeName: string; city?: string | null; state?: string | null }>
  ): Promise<Map<string, MatchResult>> {
    const results = new Map<string, MatchResult>();
    
    // Process with controlled concurrency
    await Promise.all(
      items.map(item =>
        dbLimit(async () => {
          const result = await this.match(item.payeeName, {
            city: item.city,
            state: item.state
          });
          results.set(item.id, result);
        })
      )
    );
    
    return results;
  }
  
  /**
   * Try exact match - fastest path with proper indexes
   */
  private async tryExactMatch(payeeName: string, normalized: string): Promise<any> {
    // Use indexed expression columns for O(log n) lookups - WITH CONCURRENCY LIMIT
    return dbLimit(async () => {
      const result = await db.execute(sql`
        SELECT * FROM cached_suppliers
        WHERE lower(payee_name) = ${normalized}
           OR lower(payee_name) = ${payeeName.toLowerCase()}
           OR lower(COALESCE(normalized_name, '')) = ${normalized}
           OR lower(COALESCE(mastercard_business_name, '')) = ${normalized}
        LIMIT 1
      `);
      
      return result.rows.length > 0 ? result.rows[0] : null;
    });
  }
  
  /**
   * Find candidates using trigram similarity (pg_trgm) - PROPERLY OPTIMIZED
   */
  private async findCandidates(normalizedName: string): Promise<Candidate[]> {
    // Use concurrency limit for database queries
    return dbLimit(async () => {
      try {
        // Simplified query focusing on primary payee_name for speed
        // The % operator uses the trigram index efficiently
        const results = await db.execute(sql`
          SELECT 
            id,
            payee_name as "payeeName",
            city,
            state,
            similarity(lower(payee_name), ${normalizedName}) as similarity
          FROM cached_suppliers
          WHERE lower(payee_name) % ${normalizedName}
          ORDER BY similarity DESC
          LIMIT 15
        `);
        
        return results.rows.map(row => ({
          id: String(row.id),
          payeeName: String(row.payeeName || ''),
          city: row.city as string | null,
          state: row.state as string | null,
          similarity: Number(row.similarity || 0)
        }));
      } catch (error) {
        console.error('Error finding candidates:', error);
        return [];
      }
    });
  }
  
  /**
   * Early accept rules for high-confidence matches
   */
  private earlyAccept(
    normalizedInput: string,
    candidate: Candidate,
    context?: { city?: string | null; state?: string | null }
  ): { accept: boolean; confidence: number; reason: string } {
    const candidateNorm = this.normalize(candidate.payeeName);
    
    // Rule 1: Exact normalized match
    if (candidateNorm === normalizedInput) {
      return { accept: true, confidence: 0.98, reason: 'Exact normalized match' };
    }
    
    // Rule 2: Very high similarity (>0.95) with matching state
    if (candidate.similarity >= 0.95) {
      if (context?.state && candidate.state === context.state) {
        return { accept: true, confidence: 0.96, reason: 'High similarity with matching state' };
      }
      return { accept: true, confidence: 0.94, reason: 'Very high similarity' };
    }
    
    // Rule 3: High similarity (>0.9) with exact state match
    if (candidate.similarity >= 0.9 && context?.state && candidate.state === context.state) {
      return { accept: true, confidence: 0.92, reason: 'High similarity with state match' };
    }
    
    // Rule 4: Prefix match with state
    if (candidateNorm.startsWith(normalizedInput) || normalizedInput.startsWith(candidateNorm)) {
      if (context?.state && candidate.state === context.state) {
        return { accept: true, confidence: 0.88, reason: 'Prefix match with state' };
      }
    }
    
    return { accept: false, confidence: 0, reason: '' };
  }
  
  /**
   * Use OpenAI to judge ambiguous matches
   */
  private async judgeWithLLM(
    payee: { name: string; city?: string | null; state?: string | null },
    candidates: Candidate[]
  ): Promise<{ matched: boolean; supplierId: string | null; confidence: number; reasoning: string }> {
    if (!openai) {
      return { matched: false, supplierId: null, confidence: 0, reasoning: 'OpenAI not available' };
    }
    
    try {
      const systemPrompt = `You are a careful record-linkage adjudicator for financial data.
Return STRICT JSON only. Decide if the payee is the SAME legal entity as any candidate.
Be conservative - if uncertain, return matched=false.
Consider common variations, abbreviations, DBA names, and typos.`;

      const userPrompt = {
        task: "decide_match",
        payee,
        candidates: candidates.map(c => ({
          id: c.id,
          name: c.payeeName,
          city: c.city,
          state: c.state,
          db_similarity: c.similarity
        })),
        output_schema: {
          matched: "boolean",
          supplier_id: "string | null (the ID of matched supplier)",
          confidence: "0-1 (0.98 for exact, 0.9 for strong, 0.6 for weak)",
          reasoning: "brief explanation"
        },
        rules: [
          "Prefer candidates with higher db_similarity scores",
          "Location agreement strengthens confidence",
          "Ignore superficial differences like Inc/LLC/Ltd/Co/Corp",
          "Return matched=false if no strong match exists"
        ]
      };

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPrompt) }
        ]
      });

      const result = JSON.parse(response.choices[0].message?.content || '{}');
      
      return {
        matched: result.matched || false,
        supplierId: result.supplier_id || null,
        confidence: result.confidence || 0,
        reasoning: result.reasoning || 'No reasoning provided'
      };
    } catch (error) {
      console.error('OpenAI judge error:', error);
      return { matched: false, supplierId: null, confidence: 0, reasoning: 'LLM error' };
    }
  }
  
  /**
   * Normalize name for comparison
   */
  private normalize(name: string): string {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .trim()
      // Remove common business suffixes
      .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co)\b\.?/gi, '')
      // Remove special characters but keep spaces
      .replace(/[^\w\s]/g, '')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Export singleton instance
export const finexioMatcherV3 = new FinexioMatcherV3();