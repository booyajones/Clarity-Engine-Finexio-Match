import { classificationIntelligence } from './classificationIntelligence';
import { OpenAI } from 'openai';
import { LRUCache } from 'lru-cache';

interface ClassificationResult {
  payeeType: string;
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
  processingTime: number;
  method: string;
}

interface PipelineMetrics {
  stage1Hits: number;
  stage2Hits: number;
  stage3Hits: number;
  stage4Hits: number;
  stage5Hits: number;
  totalProcessed: number;
  avgProcessingTime: number;
  cacheHitRate: number;
  apiCallsSaved: number;
  costSavings: number;
}

/**
 * Progressive Enhancement Pipeline
 * Multi-stage classification that gets progressively more sophisticated
 * Optimized for speed and cost efficiency
 */
export class ProgressivePipeline {
  private metrics: PipelineMetrics;
  private gptCache: LRUCache<string, ClassificationResult>;
  private openai: OpenAI | null;
  private processingTimes: number[] = [];
  
  constructor() {
    this.metrics = {
      stage1Hits: 0,
      stage2Hits: 0,
      stage3Hits: 0,
      stage4Hits: 0,
      stage5Hits: 0,
      totalProcessed: 0,
      avgProcessingTime: 0,
      cacheHitRate: 0,
      apiCallsSaved: 0,
      costSavings: 0
    };
    
    // GPT results cache
    this.gptCache = new LRUCache<string, ClassificationResult>({
      max: 5000,
      ttl: 1000 * 60 * 60 * 24 // 24 hours
    });
    
    // Initialize OpenAI if available
    this.openai = process.env.OPENAI_API_KEY 
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  /**
   * Process a payee through progressive enhancement stages
   */
  async classify(
    payeeName: string,
    context?: {
      amount?: number;
      frequency?: string;
      category?: string;
      otherPayees?: string[];
      address?: string;
      city?: string;
      state?: string;
      batchContext?: any;
    }
  ): Promise<ClassificationResult> {
    const startTime = Date.now();
    this.metrics.totalProcessed++;
    
    // Stage 1: Pattern matching (1ms)
    const stage1Result = await this.stage1_patternMatching(payeeName);
    if (stage1Result.confidence >= 0.99) {
      this.metrics.stage1Hits++;
      this.metrics.apiCallsSaved++;
      this.recordProcessingTime(Date.now() - startTime);
      return { ...stage1Result, processingTime: Date.now() - startTime, method: 'pattern' };
    }
    
    // Stage 2: Intelligent Classification with fingerprinting (5ms)
    const stage2Result = await this.stage2_intelligentClassification(payeeName, context);
    if (stage2Result.confidence >= 0.95) {
      this.metrics.stage2Hits++;
      this.metrics.apiCallsSaved++;
      this.recordProcessingTime(Date.now() - startTime);
      return { ...stage2Result, processingTime: Date.now() - startTime, method: 'intelligent' };
    }
    
    // Stage 3: Fuzzy matching with known entities (20ms)
    const stage3Result = await this.stage3_fuzzyMatching(payeeName, context);
    if (stage3Result.confidence >= 0.90) {
      this.metrics.stage3Hits++;
      this.metrics.apiCallsSaved++;
      this.recordProcessingTime(Date.now() - startTime);
      return { ...stage3Result, processingTime: Date.now() - startTime, method: 'fuzzy' };
    }
    
    // Stage 4: Cached GPT results (50ms)
    const stage4Result = await this.stage4_cachedGPT(payeeName, context);
    if (stage4Result) {
      this.metrics.stage4Hits++;
      this.metrics.apiCallsSaved++;
      this.recordProcessingTime(Date.now() - startTime);
      return { ...stage4Result, processingTime: Date.now() - startTime, method: 'cached-gpt' };
    }
    
    // Stage 5: Fresh GPT call (500ms)
    const stage5Result = await this.stage5_freshGPT(payeeName, context);
    this.metrics.stage5Hits++;
    this.recordProcessingTime(Date.now() - startTime);
    
    // Cache the result
    const cacheKey = this.getCacheKey(payeeName, context);
    this.gptCache.set(cacheKey, stage5Result);
    
    return { ...stage5Result, processingTime: Date.now() - startTime, method: 'gpt' };
  }

  /**
   * Stage 1: Pattern matching (fastest)
   */
  private async stage1_patternMatching(payeeName: string): Promise<ClassificationResult> {
    const upperName = payeeName.toUpperCase();
    
    // Government patterns with 99% confidence
    if (upperName.includes('INTERNAL REVENUE SERVICE') ||
        upperName.includes('DEPARTMENT OF TREASURY') ||
        upperName.includes('SOCIAL SECURITY ADMINISTRATION') ||
        /\bIRS\b/.test(upperName) ||
        /\bSSA\b/.test(upperName) ||
        /\bDMV\b/.test(upperName)) {
      return {
        payeeType: 'Government',
        confidence: 0.99,
        reasoning: 'Exact government entity match',
        processingTime: 1,
        method: 'pattern'
      };
    }
    
    // Known insurance companies
    const insuranceCompanies = ['STATE FARM', 'GEICO', 'PROGRESSIVE', 'ALLSTATE', 'LIBERTY MUTUAL'];
    if (insuranceCompanies.some(company => upperName.includes(company))) {
      return {
        payeeType: 'Insurance',
        confidence: 0.99,
        reasoning: 'Known insurance company',
        processingTime: 1,
        method: 'pattern'
      };
    }
    
    // Banking patterns
    const bankPatterns = ['BANK', 'CREDIT UNION', 'FEDERAL CREDIT', 'CHASE', 'WELLS FARGO', 'BANK OF AMERICA'];
    if (bankPatterns.some(pattern => upperName.includes(pattern))) {
      return {
        payeeType: 'Banking',
        confidence: 0.95,
        reasoning: 'Banking institution pattern',
        processingTime: 1,
        method: 'pattern'
      };
    }
    
    return {
      payeeType: 'Unknown',
      confidence: 0,
      reasoning: 'No pattern match',
      processingTime: 1,
      method: 'pattern'
    };
  }

  /**
   * Stage 2: Intelligent classification with context
   */
  private async stage2_intelligentClassification(
    payeeName: string,
    context?: any
  ): Promise<ClassificationResult> {
    const result = await classificationIntelligence.classifyWithIntelligence(
      payeeName,
      context
    );
    
    return {
      payeeType: result.payeeType,
      confidence: result.confidence,
      sicCode: result.sicCode,
      sicDescription: result.sicDescription,
      reasoning: result.reasoning || 'Intelligent classification',
      processingTime: 5,
      method: 'intelligent'
    };
  }

  /**
   * Stage 3: Fuzzy matching
   */
  private async stage3_fuzzyMatching(
    payeeName: string,
    context?: any
  ): Promise<ClassificationResult> {
    // Would implement actual fuzzy matching here
    // For now, return low confidence
    return {
      payeeType: 'Unknown',
      confidence: 0,
      reasoning: 'No fuzzy match found',
      processingTime: 20,
      method: 'fuzzy'
    };
  }

  /**
   * Stage 4: Check cached GPT results
   */
  private async stage4_cachedGPT(
    payeeName: string,
    context?: any
  ): Promise<ClassificationResult | null> {
    const cacheKey = this.getCacheKey(payeeName, context);
    const cached = this.gptCache.get(cacheKey);
    
    if (cached) {
      this.metrics.cacheHitRate = 
        (this.metrics.cacheHitRate * (this.metrics.totalProcessed - 1) + 1) / 
        this.metrics.totalProcessed;
      return cached;
    }
    
    return null;
  }

  /**
   * Stage 5: Fresh GPT API call
   */
  private async stage5_freshGPT(
    payeeName: string,
    context?: any
  ): Promise<ClassificationResult> {
    if (!this.openai) {
      return {
        payeeType: 'Business',
        confidence: 0.5,
        reasoning: 'OpenAI not configured, defaulting to Business',
        processingTime: 0,
        method: 'default'
      };
    }
    
    try {
      const contextStr = context ? 
        `Context: Amount: ${context.amount}, Location: ${context.city}, ${context.state}` : '';
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: 'Classify payees as Individual, Business, Government, Insurance, or Banking. Respond with JSON only.'
        }, {
          role: 'user',
          content: `Classify: ${payeeName}. ${contextStr}`
        }],
        temperature: 0.1,
        max_tokens: 100
      });
      
      const response = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Track cost savings
      this.metrics.costSavings = this.metrics.apiCallsSaved * 0.002; // Approximate cost per API call
      
      return {
        payeeType: response.payeeType || 'Business',
        confidence: response.confidence || 0.8,
        sicCode: response.sicCode,
        sicDescription: response.sicDescription,
        reasoning: response.reasoning || 'GPT-4 classification',
        processingTime: 500,
        method: 'gpt'
      };
    } catch (error) {
      console.error('GPT classification error:', error);
      return {
        payeeType: 'Business',
        confidence: 0.5,
        reasoning: 'GPT error, defaulting to Business',
        processingTime: 500,
        method: 'error'
      };
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(payeeName: string, context?: any): string {
    const normalized = payeeName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const contextKey = context ? 
      `${context.city || ''}${context.state || ''}${context.category || ''}` : '';
    return `${normalized}:${contextKey}`;
  }

  /**
   * Record processing time for metrics
   */
  private recordProcessingTime(time: number): void {
    this.processingTimes.push(time);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }
    this.metrics.avgProcessingTime = 
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.stage4Hits / Math.max(1, this.metrics.totalProcessed)
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      stage1Hits: 0,
      stage2Hits: 0,
      stage3Hits: 0,
      stage4Hits: 0,
      stage5Hits: 0,
      totalProcessed: 0,
      avgProcessingTime: 0,
      cacheHitRate: 0,
      apiCallsSaved: 0,
      costSavings: 0
    };
    this.processingTimes = [];
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const total = this.metrics.totalProcessed || 1;
    return {
      totalProcessed: total,
      patternMatches: `${((this.metrics.stage1Hits / total) * 100).toFixed(1)}%`,
      intelligentMatches: `${((this.metrics.stage2Hits / total) * 100).toFixed(1)}%`,
      fuzzyMatches: `${((this.metrics.stage3Hits / total) * 100).toFixed(1)}%`,
      cachedGPT: `${((this.metrics.stage4Hits / total) * 100).toFixed(1)}%`,
      freshGPT: `${((this.metrics.stage5Hits / total) * 100).toFixed(1)}%`,
      avgProcessingTime: `${this.metrics.avgProcessingTime.toFixed(0)}ms`,
      apiCallsSaved: this.metrics.apiCallsSaved,
      costSavings: `$${this.metrics.costSavings.toFixed(2)}`,
      throughput: total > 0 ? `${(1000 / this.metrics.avgProcessingTime).toFixed(1)} records/sec` : '0'
    };
  }
}

// Export singleton instance
export const progressivePipeline = new ProgressivePipeline();