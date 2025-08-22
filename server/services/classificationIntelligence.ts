import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';

interface ClassificationResult {
  payeeType: 'Individual' | 'Business' | 'Government' | 'Insurance';
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning?: string;
}

interface FingerprintCache {
  normalized: string;
  result: ClassificationResult;
  hitCount: number;
  lastSeen: Date;
}

export class ClassificationIntelligence {
  // Multi-level caching system
  private fingerprintCache: LRUCache<string, FingerprintCache>;
  private patternCache: LRUCache<string, ClassificationResult>;
  private fuzzyMatchCache: LRUCache<string, ClassificationResult>;
  
  // Pattern rules learned from classifications
  private learnedPatterns: Map<string, { type: string; confidence: number; count: number }>;
  
  // SIC code mappings
  private sicCodeCache: Map<string, { code: string; description: string }>;
  
  // Statistical tracking
  private classificationStats: {
    totalProcessed: number;
    patternHits: number;
    cacheHits: number;
    apiCalls: number;
    averageConfidence: number;
  };

  constructor() {
    // Initialize caches with memory-safe limits
    this.fingerprintCache = new LRUCache<string, FingerprintCache>({
      max: 10000,
      ttl: 1000 * 60 * 60 * 24, // 24 hours
      sizeCalculation: () => 1
    });
    
    this.patternCache = new LRUCache<string, ClassificationResult>({
      max: 5000,
      ttl: 1000 * 60 * 60 * 12, // 12 hours
    });
    
    this.fuzzyMatchCache = new LRUCache<string, ClassificationResult>({
      max: 2000,
      ttl: 1000 * 60 * 60 * 6, // 6 hours
    });
    
    this.learnedPatterns = new Map();
    this.sicCodeCache = new Map();
    this.classificationStats = {
      totalProcessed: 0,
      patternHits: 0,
      cacheHits: 0,
      apiCalls: 0,
      averageConfidence: 0
    };
    
    this.initializePatterns();
    this.initializeSicCodes();
  }

  /**
   * Pre-process and normalize payee names
   */
  normalizePayeeName(name: string): string {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .trim()
      .toUpperCase()
      // Standardize business suffixes
      .replace(/\b(INCORPORATED|INC\.?|CORP\.?|CORPORATION|LLC|L\.L\.C\.|LTD\.?|LIMITED|LP|L\.P\.|LLP|L\.L\.P\.)\b/gi, '')
      // Remove common articles
      .replace(/\b(THE|A|AN)\b/gi, '')
      // Standardize "and"
      .replace(/\b(AND|&)\b/gi, '&')
      // Remove punctuation
      .replace(/[.,;:!?'"()-]/g, '')
      // Multiple spaces to single
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate fingerprint for exact match caching
   */
  generateFingerprint(name: string, address?: string): string {
    const normalized = this.normalizePayeeName(name);
    const addressNorm = address ? address.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const combined = `${normalized}|${addressNorm}`;
    return createHash('md5').update(combined).digest('hex');
  }

  /**
   * Multi-pass classification with hierarchical caching
   */
  async classifyWithIntelligence(
    payeeName: string,
    context?: {
      amount?: number;
      frequency?: string;
      category?: string;
      otherPayees?: string[];
      address?: string;
      city?: string;
      state?: string;
    }
  ): Promise<ClassificationResult> {
    this.classificationStats.totalProcessed++;
    
    // Level 1: Exact fingerprint match
    const fingerprint = this.generateFingerprint(payeeName, context?.address);
    const cached = this.fingerprintCache.get(fingerprint);
    if (cached) {
      cached.hitCount++;
      cached.lastSeen = new Date();
      this.fingerprintCache.set(fingerprint, cached);
      this.classificationStats.cacheHits++;
      return cached.result;
    }
    
    // Level 2: Pattern matching (instant, free)
    const patternResult = this.matchPatterns(payeeName);
    if (patternResult && patternResult.confidence >= 0.9) {
      this.cacheResult(fingerprint, payeeName, patternResult);
      this.classificationStats.patternHits++;
      return patternResult;
    }
    
    // Level 3: Fuzzy matching against known entities
    const fuzzyResult = await this.fuzzyMatch(payeeName);
    if (fuzzyResult && fuzzyResult.confidence >= 0.85) {
      this.cacheResult(fingerprint, payeeName, fuzzyResult);
      return fuzzyResult;
    }
    
    // Level 4: Context-enhanced classification
    const contextEnhancedName = this.enhanceWithContext(payeeName, context);
    
    // Return pattern result if found (even with lower confidence)
    if (patternResult) {
      this.cacheResult(fingerprint, payeeName, patternResult);
      return patternResult;
    }
    
    // Default fallback
    return {
      payeeType: 'Business',
      confidence: 0.5,
      reasoning: 'Default classification - requires API call'
    };
  }

  /**
   * Pattern matching for instant classification
   */
  private matchPatterns(name: string): ClassificationResult | null {
    const upperName = name.toUpperCase();
    
    // Government patterns
    if (upperName.includes('DEPARTMENT OF') || 
        upperName.includes('BUREAU OF') ||
        upperName.includes('FEDERAL') ||
        upperName.includes('STATE OF') ||
        upperName.includes('COUNTY OF') ||
        upperName.includes('CITY OF') ||
        /\bIRS\b/.test(upperName) ||
        /\bDMV\b/.test(upperName) ||
        /\bUSPS\b/.test(upperName)) {
      return {
        payeeType: 'Government',
        confidence: 0.95,
        reasoning: 'Matched government pattern'
      };
    }
    
    // Insurance patterns
    if (upperName.includes('INSURANCE') ||
        upperName.includes('MUTUAL') ||
        upperName.includes('ASSURANCE') ||
        upperName.includes('INDEMNITY')) {
      return {
        payeeType: 'Insurance',
        confidence: 0.92,
        reasoning: 'Matched insurance pattern'
      };
    }
    
    // Business patterns
    if (/\b(LLC|INC|CORP|CO|LTD|LP|LLP|CORPORATION|INCORPORATED|LIMITED)\b/i.test(name)) {
      return {
        payeeType: 'Business',
        confidence: 0.90,
        reasoning: 'Business suffix detected'
      };
    }
    
    // Individual patterns
    if (this.isLikelyIndividual(name)) {
      return {
        payeeType: 'Individual',
        confidence: 0.85,
        reasoning: 'Name pattern suggests individual'
      };
    }
    
    return null;
  }

  /**
   * Check if name likely belongs to an individual
   */
  private isLikelyIndividual(name: string): boolean {
    // Common name patterns
    const nameParts = name.split(/\s+/);
    
    // Likely individual if 2-3 words without business indicators
    if (nameParts.length >= 2 && nameParts.length <= 3) {
      const hasBusinessWords = /\b(company|services|solutions|group|enterprises|holdings|partners)\b/i.test(name);
      const hasNumbers = /\d/.test(name);
      const hasSpecialChars = /[&@#$%]/.test(name);
      
      return !hasBusinessWords && !hasNumbers && !hasSpecialChars;
    }
    
    // Check for "FirstName LastName" pattern
    const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
    return namePattern.test(name);
  }

  /**
   * Fuzzy matching against cached classifications
   */
  private async fuzzyMatch(name: string): Promise<ClassificationResult | null> {
    const normalized = this.normalizePayeeName(name);
    
    // Check fuzzy cache first
    const cached = this.fuzzyMatchCache.get(normalized);
    if (cached) return cached;
    
    // Would implement actual fuzzy matching logic here
    // Using Levenshtein distance, Soundex, etc.
    return null;
  }

  /**
   * Enhance payee name with context for better classification
   */
  private enhanceWithContext(
    name: string, 
    context?: any
  ): string {
    let enhanced = name;
    
    if (context) {
      const contextParts = [];
      
      if (context.amount) {
        contextParts.push(`Amount: $${context.amount}`);
      }
      
      if (context.frequency) {
        contextParts.push(`Frequency: ${context.frequency}`);
      }
      
      if (context.category) {
        contextParts.push(`Category: ${context.category}`);
      }
      
      if (context.otherPayees && context.otherPayees.length > 0) {
        const sample = context.otherPayees.slice(0, 3).join(', ');
        contextParts.push(`Related: ${sample}`);
      }
      
      if (contextParts.length > 0) {
        enhanced = `${name} [Context: ${contextParts.join(', ')}]`;
      }
    }
    
    return enhanced;
  }

  /**
   * Cache classification result
   */
  private cacheResult(
    fingerprint: string, 
    originalName: string, 
    result: ClassificationResult
  ): void {
    const normalized = this.normalizePayeeName(originalName);
    
    // Store in fingerprint cache
    this.fingerprintCache.set(fingerprint, {
      normalized,
      result,
      hitCount: 1,
      lastSeen: new Date()
    });
    
    // Also store in pattern cache if high confidence
    if (result.confidence >= 0.9) {
      this.patternCache.set(normalized, result);
    }
    
    // Learn from the classification
    this.learnFromClassification(originalName, result);
  }

  /**
   * Self-improving: Learn patterns from classifications
   */
  private learnFromClassification(
    name: string, 
    result: ClassificationResult
  ): void {
    // Extract patterns from successful classifications
    const words = name.split(/\s+/);
    
    for (const word of words) {
      if (word.length > 3) {
        const key = word.toUpperCase();
        const existing = this.learnedPatterns.get(key) || { 
          type: result.payeeType, 
          confidence: 0, 
          count: 0 
        };
        
        // Update pattern statistics
        existing.count++;
        existing.confidence = (existing.confidence * (existing.count - 1) + result.confidence) / existing.count;
        
        this.learnedPatterns.set(key, existing);
      }
    }
  }

  /**
   * Initialize common patterns
   */
  private initializePatterns(): void {
    // Government keywords
    const govKeywords = ['FEDERAL', 'STATE', 'COUNTY', 'CITY', 'MUNICIPAL', 'TREASURY'];
    govKeywords.forEach(kw => {
      this.learnedPatterns.set(kw, { type: 'Government', confidence: 0.9, count: 100 });
    });
    
    // Business keywords
    const bizKeywords = ['CORPORATION', 'ENTERPRISES', 'SOLUTIONS', 'SERVICES', 'HOLDINGS'];
    bizKeywords.forEach(kw => {
      this.learnedPatterns.set(kw, { type: 'Business', confidence: 0.85, count: 100 });
    });
  }

  /**
   * Initialize common SIC codes
   */
  private initializeSicCodes(): void {
    // Common SIC codes for quick lookup
    this.sicCodeCache.set('MICROSOFT', { code: '7372', description: 'Software Publishers' });
    this.sicCodeCache.set('AMAZON', { code: '5961', description: 'Electronic Shopping' });
    this.sicCodeCache.set('GOOGLE', { code: '7311', description: 'Advertising Agencies' });
    this.sicCodeCache.set('APPLE', { code: '3571', description: 'Electronic Computers' });
    this.sicCodeCache.set('WALMART', { code: '5331', description: 'Variety Stores' });
  }

  /**
   * Get SIC code for business
   */
  getSicCode(businessName: string): { code: string; description: string } | null {
    const normalized = this.normalizePayeeName(businessName);
    
    // Check cache
    for (const [key, value] of this.sicCodeCache.entries()) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    
    return null;
  }

  /**
   * Split compound entities
   */
  splitCompoundEntity(name: string): string[] {
    // Handle "John and Jane Smith" type names
    if (name.includes(' and ') || name.includes(' & ')) {
      const parts = name.split(/\s+(?:and|&)\s+/i);
      if (parts.length === 2 && this.isLikelyIndividual(parts[0]) && this.isLikelyIndividual(parts[1])) {
        return parts;
      }
    }
    
    // Handle DBA
    if (name.includes(' DBA ') || name.includes(' d/b/a ')) {
      const parts = name.split(/\s+(?:DBA|d\/b\/a)\s+/i);
      return [parts[0]]; // Return primary business name
    }
    
    return [name];
  }

  /**
   * Get classification statistics
   */
  getStats() {
    return {
      ...this.classificationStats,
      cacheSize: this.fingerprintCache.size,
      patternCacheSize: this.patternCache.size,
      learnedPatterns: this.learnedPatterns.size
    };
  }

  /**
   * Clear caches (for memory management)
   */
  clearCaches(): void {
    console.log('🧹 Clearing classification intelligence caches');
    this.fingerprintCache.clear();
    this.patternCache.clear();
    this.fuzzyMatchCache.clear();
  }
}

// Export singleton instance
export const classificationIntelligence = new ClassificationIntelligence();