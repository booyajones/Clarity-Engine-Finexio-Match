/**
 * OpenAI-only Classification Service
 * Simple, reliable classification using only OpenAI GPT-5
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import pLimit from 'p-limit';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Limit concurrent OpenAI calls to prevent rate limiting
const classificationLimit = pLimit(16);

export interface ClassificationResult {
  payeeType: string;
  confidence: number;
  sicCode?: string | null;
  sicDescription?: string | null;
  reasoning: string;
  flagForReview?: boolean;
}

export interface PayeeData {
  originalName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  originalData?: Record<string, any>;
}

class OpenAIClassificationService {
  private activeJobs = new Map<number, AbortController>();

  async classifyFile(
    batchId: number,
    filePath: string,
    payeeColumn?: string,
    fileExtension?: string,
    addressColumns?: any,
    matchingOptions?: any
  ): Promise<void> {
    console.log(`Starting optimized OpenAI classification for batch ${batchId}`);
    
    // Update batch status
    await storage.updateUploadBatch(batchId, {
      status: "processing",
      classificationStatus: "in_progress",
      currentStep: "Classification in progress",
      progressMessage: "Using optimized OpenAI for classification..."
    });

    const abortController = new AbortController();
    this.activeJobs.set(batchId, abortController);

    try {
      // Parse the file and extract payees
      const payees = await this.extractPayeesFromFile(filePath, payeeColumn, fileExtension);
      console.log(`Extracted ${payees.length} payees from file`);

      // Process in larger batches with multiple payees per API call
      const CHUNK_SIZE = 25; // Number of payees per OpenAI call
      const CONCURRENT_CALLS = 10; // Number of concurrent API calls
      let processedCount = 0;
      const allClassifications = [];

      // Create chunks of payees
      const chunks = [];
      for (let i = 0; i < payees.length; i += CHUNK_SIZE) {
        chunks.push(payees.slice(i, i + CHUNK_SIZE));
      }

      // Process chunks with concurrency limit
      const limit = pLimit(CONCURRENT_CALLS);
      const promises = chunks.map((chunk, index) => 
        limit(async () => {
          if (abortController.signal.aborted) {
            throw new Error('Job cancelled');
          }

          console.log(`Processing chunk ${index + 1}/${chunks.length}: ${chunk.length} payees`);
          const classifications = await this.classifyMultiplePayees(chunk, batchId);
          
          processedCount += chunk.length;
          
          // Update progress periodically
          if (processedCount % 100 === 0 || processedCount === payees.length) {
            await storage.updateUploadBatch(batchId, {
              processedRecords: processedCount,
              totalRecords: payees.length,
              progressMessage: `Classified ${processedCount}/${payees.length} records`
            });
          }
          
          return classifications;
        })
      );

      const results = await Promise.all(promises);
      for (const classifications of results) {
        allClassifications.push(...classifications);
      }

      // Save all classifications
      console.log(`Saving ${allClassifications.length} classifications`);
      await storage.createPayeeClassifications(allClassifications);

      // Mark classification as complete
      await storage.updateUploadBatch(batchId, {
        classificationStatus: "completed",
        classificationCompletedAt: new Date(),
        currentStep: "Classification complete",
        progressMessage: `Successfully classified ${payees.length} records`
      });

      // Start next modules if enabled
      if (matchingOptions?.enableFinexio !== false) {
        this.startFinexioMatching(batchId);
      }

    } catch (error) {
      console.error(`Classification error for batch ${batchId}:`, error);
      await storage.updateUploadBatch(batchId, {
        classificationStatus: "failed",
        status: "failed",
        errorMessage: error.message
      });
    } finally {
      this.activeJobs.delete(batchId);
      // Clean up file
      const fs = await import('fs');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  private async extractPayeesFromFile(filePath: string, payeeColumn?: string, fileExtension?: string): Promise<PayeeData[]> {
    const fs = await import('fs');
    const csv = await import('csv-parser');
    
    const ext = fileExtension || filePath.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      // Handle Excel files
      const XLSX = await import('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      
      const payees: PayeeData[] = [];
      const nameColumn = payeeColumn || this.detectNameColumn(data[0]);
      for (const row of data) {
        const payeeName = row[nameColumn];
        if (payeeName && typeof payeeName === 'string' && payeeName.trim()) {
          payees.push({
            originalName: payeeName.trim(),
            originalData: row
          });
        }
      }
      
      // Remove duplicates
      const uniquePayees = new Map<string, PayeeData>();
      for (const payee of payees) {
        const key = payee.originalName.toLowerCase().trim();
        if (!uniquePayees.has(key)) {
          uniquePayees.set(key, payee);
        }
      }
      
      return Array.from(uniquePayees.values());
    } else {
      // Handle CSV files using csv-parser stream
      return new Promise((resolve, reject) => {
        const payees: PayeeData[] = [];
        const records: any[] = [];
        fs.createReadStream(filePath)
          .pipe(csv.default())
          .on('data', (row) => records.push(row))
          .on('end', () => {
            const nameColumn = payeeColumn || this.detectNameColumn(records[0]);
            for (const row of records) {
              const payeeName = row[nameColumn];
              if (payeeName && payeeName.trim()) {
                payees.push({
                  originalName: payeeName.trim(),
                  originalData: row
                });
              }
            }
            
            // Remove duplicates
            const uniquePayees = new Map<string, PayeeData>();
            for (const payee of payees) {
              const key = payee.originalName.toLowerCase().trim();
              if (!uniquePayees.has(key)) {
                uniquePayees.set(key, payee);
              }
            }
            
            resolve(Array.from(uniquePayees.values()));
          })
          .on('error', reject);
      });
    }
  }

  private detectNameColumn(row: Record<string, any>): string {
    if (!row) return Object.keys(row)[0];
    
    const nameVariations = ['payee_name', 'payee', 'vendor', 'supplier', 'name', 'company'];
    const keys = Object.keys(row);
    
    for (const variation of nameVariations) {
      const found = keys.find(key => key.toLowerCase().includes(variation));
      if (found) return found;
    }
    
    return keys[0];
  }

  private async classifyMultiplePayees(payees: PayeeData[], batchId: number): Promise<any[]> {
    try {
      // Send multiple payees to OpenAI in a single call
      const payeeNames = payees.map(p => p.originalName);
      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
        messages: [
          {
            role: "system",
            content: `You are a financial data classification expert. Classify multiple payees at once.
            
CATEGORIES:
• Individual - Personal names, employees, contractors, students
• Business - Companies, corporations, brands, stores, restaurants, services
• Government - Government agencies, departments, municipalities, tax authorities  
• Insurance - Insurance companies, carriers, brokers
• Banking - Banks, credit unions, financial institutions
• Internal Transfer - Internal company transfers only

IMPORTANT RULES:
1. FedEx, Microsoft, HD Supply, Amazon, Apple, Google, Walmart, Target, etc. are ALWAYS Business
2. Any company name or brand is Business
3. Only classify as Individual if it's clearly a person's name with no business context
4. When in doubt between Individual and Business, choose Business
5. Provide confidence 0.95-0.99 for clear cases, 0.80-0.94 for less certain

Return a JSON array with one object per payee:
{
  "classifications": [
    {
      "payeeName": "FedEx",
      "payeeType": "Business",
      "confidence": 0.99,
      "sicCode": "4513",
      "sicDescription": "Air Courier Services",
      "reasoning": "FedEx is a major shipping company"
    },
    ...
  ]
}`
          },
          {
            role: "user",
            content: `Classify these ${payeeNames.length} payees:\n${payeeNames.map((name, i) => `${i+1}. "${name}"`).join('\n')}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000 // Increased for multiple payees
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      const classificationsMap = new Map();
      
      // Map results back to original payees
      if (result.classifications && Array.isArray(result.classifications)) {
        for (const classification of result.classifications) {
          classificationsMap.set(classification.payeeName, classification);
        }
      }
      
      // Build final classifications array
      return payees.map(payee => {
        const classification = classificationsMap.get(payee.originalName) || {};
        
        // Ensure Business for known companies
        const knownBusinesses = ['FEDEX', 'FED EX', 'MICROSOFT', 'HD SUPPLY', 'AMAZON', 'GOOGLE', 'APPLE', 'WALMART', 'TARGET', 'HOME DEPOT', 'BEST BUY', 'UPS'];
        const upperName = payee.originalName.toUpperCase();
        
        if (knownBusinesses.some(company => upperName.includes(company))) {
          classification.payeeType = 'Business';
          classification.confidence = Math.max(classification.confidence || 0.95, 0.98);
        }
        
        return {
          batchId,
          originalName: payee.originalName,
          cleanedName: payee.originalName.toLowerCase().trim(),
          payeeType: classification.payeeType || 'Business',
          confidence: Math.min(Math.max(classification.confidence || 0.85, 0), 1),
          sicCode: classification.sicCode || null,
          sicDescription: classification.sicDescription || null,
          reasoning: classification.reasoning || `Classified as ${classification.payeeType || 'Business'}`,
          status: (classification.confidence || 0.85) < 0.95 ? "pending-review" : "auto-classified",
          originalData: payee.originalData
        };
      });
      
    } catch (error) {
      console.error(`Error classifying batch of ${payees.length} payees:`, error);
      // Return default classifications on error
      return payees.map(payee => ({
        batchId,
        originalName: payee.originalName,
        cleanedName: payee.originalName.toLowerCase().trim(),
        payeeType: "Business",
        confidence: 0.75,
        reasoning: `Batch classification error: ${error.message}`,
        status: "pending-review",
        originalData: payee.originalData
      }));
    }
  }

  private async classifyWithOpenAI(payee: PayeeData): Promise<ClassificationResult> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
        messages: [
          {
            role: "system",
            content: `You are a financial data classification expert. Classify the payee into one of these categories:
            
CATEGORIES:
• Individual - Personal names, employees, contractors, students
• Business - Companies, corporations, brands, stores, restaurants, services
• Government - Government agencies, departments, municipalities, tax authorities  
• Insurance - Insurance companies, carriers, brokers
• Banking - Banks, credit unions, financial institutions
• Internal Transfer - Internal company transfers only

IMPORTANT RULES:
1. FedEx, Microsoft, HD Supply, Amazon, Apple, Google, Walmart, Target, etc. are ALWAYS Business
2. Any company name or brand is Business
3. Only classify as Individual if it's clearly a person's name with no business context
4. When in doubt between Individual and Business, choose Business
5. Provide confidence 0.95-0.99 for clear cases, 0.80-0.94 for less certain

Return JSON format:
{
  "payeeType": "Business",
  "confidence": 0.98,
  "sicCode": "4513",
  "sicDescription": "Air Courier Services",
  "reasoning": "FedEx is a major shipping company"
}`
          },
          {
            role: "user",
            content: `Classify this payee: "${payee.originalName}"`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 300
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate and ensure Business for known companies
      const knownBusinesses = ['FEDEX', 'FED EX', 'MICROSOFT', 'HD SUPPLY', 'AMAZON', 'GOOGLE', 'APPLE', 'WALMART', 'TARGET', 'HOME DEPOT', 'BEST BUY', 'UPS'];
      const upperName = payee.originalName.toUpperCase();
      
      if (knownBusinesses.some(company => upperName.includes(company))) {
        result.payeeType = 'Business';
        result.confidence = Math.max(result.confidence || 0.95, 0.98);
      }
      
      return {
        payeeType: result.payeeType || 'Business',
        confidence: Math.min(Math.max(result.confidence || 0.85, 0), 1),
        sicCode: result.sicCode || null,
        sicDescription: result.sicDescription || null,
        reasoning: result.reasoning || `Classified as ${result.payeeType}`,
        flagForReview: result.confidence < 0.95
      };
      
    } catch (error) {
      console.error(`OpenAI error for ${payee.originalName}:`, error);
      // Default to Business on error
      return {
        payeeType: 'Business',
        confidence: 0.75,
        reasoning: `OpenAI error, defaulted to Business: ${error.message}`,
        flagForReview: true
      };
    }
  }

  private async startFinexioMatching(batchId: number): Promise<void> {
    try {
      console.log(`Starting Finexio matching for batch ${batchId}`);
      
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: "in_progress",
        finexioMatchingStartedAt: new Date()
      });

      // Import the optimized matching service  
      const { optimizedFinexioMatching } = await import('./optimizedFinexioMatching');
      
      // Get classifications
      const classifications = await storage.getBatchClassifications(batchId);
      console.log(`Found ${classifications.length} classifications for Finexio matching`);

      // Process in chunks
      const CHUNK_SIZE = 100;
      let matchedCount = 0;
      
      for (let i = 0; i < classifications.length; i += CHUNK_SIZE) {
        const chunk = classifications.slice(i, i + CHUNK_SIZE);
        const payeeNames = chunk.map(c => c.originalName);
        const results = await optimizedFinexioMatching.batchMatch(payeeNames, 50);
        
        // Save results to database
        for (const classification of chunk) {
          const matchResult = results.get(classification.originalName);
          
          if (matchResult && matchResult.supplier) {
            await storage.updatePayeeClassification(classification.id, {
              finexioSupplierId: String(matchResult.supplier.id),
              finexioSupplierName: matchResult.supplier.payeeName || matchResult.supplier.payee_name,
              finexioConfidence: matchResult.confidence,
              finexioMatchReasoning: `${matchResult.matchType} match`
            });
            matchedCount++;
          } else {
            await storage.updatePayeeClassification(classification.id, {
              finexioConfidence: 0,
              finexioMatchReasoning: 'No match found'
            });
          }
        }
      }
      
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: "completed",
        finexioMatchingCompletedAt: new Date(),
        finexioMatchedCount: matchedCount
      });
      
      console.log(`✅ Finexio matching completed: ${matchedCount}/${classifications.length} matched`);
      
    } catch (error) {
      console.error(`Finexio matching error:`, error);
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: "failed"
      });
    }
  }

  cancelJob(batchId: number): void {
    const controller = this.activeJobs.get(batchId);
    if (controller) {
      controller.abort();
      this.activeJobs.delete(batchId);
      console.log(`Job ${batchId} cancelled`);
    }
  }
}

export const openAIClassification = new OpenAIClassificationService();