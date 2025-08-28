import { storage } from "../storage";
import { type InsertPayeeClassification, type PayeeClassification, payeeClassifications } from "@shared/schema";
import { db } from "../db";
import OpenAI from 'openai';
import { Readable } from 'stream';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { keywordExclusionService } from './keywordExclusion';
// Rate limiting is handled at the route level, not needed here
import { mastercardApi } from './mastercardApi';
import { payeeMatchingService } from './payeeMatchingService';
import { akkioService } from './akkioService';
import { akkioModels } from "@shared/schema";
import { eq, desc, and } from 'drizzle-orm';
import { FuzzyMatcher } from './fuzzyMatcher';
import { classificationIntelligence } from './classificationIntelligence';

// Initialize OpenAI with conditional configuration
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 5,
  timeout: 20000 // 20 second timeout for faster retries
}) : null;

// Helper function to check if OpenAI is available
function isOpenAIAvailable(): boolean {
  return !!openai;
}

// Declare web_search as available in the environment
declare const web_search: (params: { query: string }) => Promise<string>;

interface ClassificationResult {
  payeeType: "Individual" | "Business" | "Government" | "Tax/Government" | "Insurance" | "Banking" | "Internal Transfer" | "Unknown";
  confidence: number;
  sicCode?: string;
  sicDescription?: string;
  reasoning: string;
  flagForReview?: boolean;
  isExcluded?: boolean;
  exclusionKeyword?: string;
}

interface PayeeData {
  originalName: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  originalData: any;
}

export class OptimizedClassificationService {
  private activeJobs = new Map<number, AbortController>();
  private matchingOptions: any = {};
  private addressColumns: any = {};
  
  async processFileStream(
    batchId: number,
    filePath: string,
    payeeColumn?: string,
    fileExtension?: string,
    matchingOptions?: any,
    addressColumns?: any
  ): Promise<void> {
    console.log(`Starting processFileStream for batch ${batchId}, file: ${filePath}`);
    console.log(`Matching options:`, matchingOptions);
    console.log(`Address columns:`, addressColumns);
    
    // Store matching options and address columns for this batch
    this.matchingOptions = matchingOptions || {};
    this.addressColumns = addressColumns || {};
    
    // Set initial statuses for disabled modules
    const statusUpdates: any = {};
    
    if (!this.matchingOptions.enableFinexio) {
      statusUpdates.finexioMatchingStatus = "skipped";
    }
    
    if (!this.matchingOptions.enableGoogleAddressValidation) {
      statusUpdates.googleAddressStatus = "skipped";
    }
    
    if (!this.matchingOptions.enableMastercard) {
      statusUpdates.mastercardEnrichmentStatus = "skipped";
    }
    
    if (!this.matchingOptions.enableAkkio) {
      statusUpdates.akkioPredictionStatus = "skipped";
    }
    
    // Store addressColumns in the batch record for later retrieval
    if (addressColumns && Object.keys(addressColumns).length > 0) {
      statusUpdates.addressColumns = addressColumns as any;
    }
    
    // Apply all status updates if there are any
    if (Object.keys(statusUpdates).length > 0) {
      await storage.updateUploadBatch(batchId, statusUpdates);
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    console.log(`File stats: size=${stats.size} bytes`);
    
    // Stream read first few lines to debug (memory optimization)
    const reader = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 4096 });
    let buffer = '';
    let linesRead = 0;
    const firstLines: string[] = [];
    
    for await (const chunk of reader) {
      buffer += chunk;
      const lines = buffer.split('\n');
      
      while (lines.length > 1 && linesRead < 3) {
        firstLines.push(lines.shift()!);
        linesRead++;
      }
      
      if (linesRead >= 3) {
        reader.destroy();
        break;
      }
      buffer = lines[0]; // Keep the incomplete line
    }
    
    console.log(`First 3 lines of file:`, firstLines);
    
    const abortController = new AbortController();
    this.activeJobs.set(batchId, abortController);
    
    try {
      // Use provided extension or detect from file path
      const ext = fileExtension || path.extname(filePath).toLowerCase();
      console.log(`File path: ${filePath}`);
      console.log(`Provided extension: "${fileExtension}"`);
      console.log(`Detected extension: "${ext}"`);
      console.log(`Processing ${ext} file for batch ${batchId}, payeeColumn="${payeeColumn}"`);
      
      console.log(`About to create stream for ${ext} file...`);
      let payeeStream: Readable;
      let csvFilePath: string;
      
      if (ext === '.xlsx' || ext === '.xls') {
        console.log(`📊 Converting Excel to CSV for processing...`);
        // Convert Excel to CSV first, then process as CSV
        csvFilePath = await this.convertExcelToCsv(filePath);
      } else {
        console.log(`📊 Processing CSV file directly...`);
        csvFilePath = filePath;
      }
      
      // Count total rows first for proper progress tracking
      console.log(`📊 Counting total rows in file...`);
      const totalRows = await this.countTotalRows(csvFilePath);
      console.log(`📊 Total rows to process: ${totalRows}`);
      
      // Set the total upfront so denominator stays fixed throughout processing
      await storage.updateUploadBatch(batchId, {
        status: "processing",
        totalRecords: totalRows,
        processedRecords: 0,
        currentStep: "Starting classification",
        progressMessage: `Processing ${totalRows} records...`
      });
      
      // Now create the stream and process
      payeeStream = this.createCsvStream(csvFilePath, payeeColumn, batchId);
      console.log(`Stream created, starting processPayeeStream with fixed total of ${totalRows} records...`);
      await this.processPayeeStream(batchId, payeeStream, abortController.signal);
    } catch (error) {
      console.error(`Error processing file for batch ${batchId}:`, error);
      throw error;
    } finally {
      this.activeJobs.delete(batchId);
      // Clean up files after processing
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted original file: ${filePath}`);
        }
        
        // Clean up temporary CSV file if it exists
        const csvFilePath = filePath + '.csv';
        if (fs.existsSync(csvFilePath)) {
          fs.unlinkSync(csvFilePath);
          console.log(`Deleted temporary CSV file: ${csvFilePath}`);
        }
      } catch (e) {
        console.error(`Failed to delete files:`, e);
      }
    }
  }
  
  private async countTotalRows(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let count = 0;
      
      fs.createReadStream(filePath)
        .pipe(csv({ skipLinesWithError: false, strict: false }))
        .on('data', () => count++)
        .on('end', () => resolve(count))
        .on('error', reject);
    });
  }
  
  private createCsvStream(filePath: string, payeeColumn?: string, batchId?: number): Readable {
    const payeeStream = new Readable({ objectMode: true, read() {} });
    let rowIndex = 0;
    let totalRows = 0;
    let detectedPayeeColumn: string | null = payeeColumn || null;
    
    console.log(`Creating CSV stream for file: ${filePath}, payeeColumn: "${payeeColumn}"`);
    
    try {
      // Use csv-parser properly
      const stream = fs.createReadStream(filePath)
        .pipe(csv({
          skipLinesWithError: false,
          strict: false
        }));
      
      stream.on('headers', async (headers) => {
        console.log('CSV headers detected:', headers);
        
        // Auto-detect payee column if not specified
        if (!detectedPayeeColumn) {
          const nameVariations = ['payee name', 'payee_name', 'payeename', 'vendor name', 'vendor_name', 'vendorname', 
                                  'supplier name', 'supplier_name', 'suppliername', 'name', 'payee', 'vendor', 'supplier', 'company'];
          
          // First try exact match (case insensitive)
          for (const variation of nameVariations) {
            const found = headers.find((h: string) => h.toLowerCase().replace(/[^a-z]/g, '') === variation.replace(/[^a-z]/g, ''));
            if (found) {
              detectedPayeeColumn = found;
              console.log(`Auto-detected payee column by exact match: ${found}`);
              break;
            }
          }
          
          // Then try contains match
          if (!detectedPayeeColumn) {
            for (const variation of nameVariations) {
              const found = headers.find((h: string) => h.toLowerCase().includes(variation.replace(/_/g, ' ')));
              if (found) {
                detectedPayeeColumn = found;
                console.log(`Auto-detected payee column by partial match: ${found}`);
                break;
              }
            }
          }
          
          // Default to first column if no match found
          if (!detectedPayeeColumn && headers.length > 0) {
            detectedPayeeColumn = headers[0];
            console.log(`Using first column as payee column: ${detectedPayeeColumn}`);
          }
        }
        
        // Detect address columns automatically
        const addressColumns: any = {};
        
        // Check for address column
        const addressVariations = ['address', 'address 1', 'address1', 'street', 'street address'];
        for (const header of headers) {
          if (addressVariations.some(v => header.toLowerCase().includes(v))) {
            addressColumns.address = header;
            break;
          }
        }
        
        // Check for city column
        const cityVariations = ['city'];
        for (const header of headers) {
          if (cityVariations.some(v => header.toLowerCase() === v)) {
            addressColumns.city = header;
            break;
          }
        }
        
        // Check for state column
        const stateVariations = ['state', 'province'];
        for (const header of headers) {
          if (stateVariations.some(v => header.toLowerCase() === v)) {
            addressColumns.state = header;
            break;
          }
        }
        
        // Check for zip column
        const zipVariations = ['zip', 'zip_code', 'zipcode', 'postal', 'postal code', 'postal_code'];
        for (const header of headers) {
          if (zipVariations.some(v => header.toLowerCase().replace(/[^a-z]/g, '') === v.replace(/[^a-z]/g, ''))) {
            addressColumns.zipCode = header;
            break;
          }
        }
        
        // Store detected address columns if any were found
        if (Object.keys(addressColumns).length > 0) {
          console.log(`Detected address columns:`, addressColumns);
          this.addressColumns = addressColumns;
          
          // Store in database for the batch
          const batchIdMatch = filePath.match(/uploads\/[^\/]+$/);
          if (batchIdMatch) {
            try {
              // Store address columns for the batch
              if (batchId) {
                await storage.updateUploadBatch(batchId, {
                  addressColumns: addressColumns
                });
                console.log(`Stored address columns for batch ${batchId}`);
              }
            } catch (err) {
              console.error('Failed to store address columns:', err);
            }
          }
        } else {
          console.log('No address columns detected in CSV');
        }
      });
      
      stream.on('data', (row: Record<string, any>) => {
        totalRows++;
        
        // Debug first few rows
        if (totalRows <= 3) {
          console.log(`Row ${totalRows}:`, JSON.stringify(row));
        }
        
        // Check if payee column exists in row
        if (detectedPayeeColumn && row[detectedPayeeColumn]) {
          // Use detected address columns if available, otherwise fall back to common variations
          const addressValue = this.addressColumns?.address ? 
            row[this.addressColumns.address] : 
            (row['Address 1'] || row.address || row.Address);
            
          const cityValue = this.addressColumns?.city ? 
            row[this.addressColumns.city] : 
            (row.City || row.city);
            
          const stateValue = this.addressColumns?.state ? 
            row[this.addressColumns.state] : 
            (row.State || row.state);
            
          const zipCodeValue = this.addressColumns?.zipCode ? 
            row[this.addressColumns.zipCode] : 
            (row.Zip || row.zip || row.ZIP || row.zip_code || row['zip_code']);
          
          payeeStream.push({
            originalName: row[detectedPayeeColumn],
            address: addressValue,
            city: cityValue,
            state: stateValue,
            zipCode: zipCodeValue,
            originalData: row,
            index: rowIndex++
          });
        } else if (totalRows <= 3) {
          console.log(`Column "${detectedPayeeColumn}" not found or empty in row ${totalRows}`);
          console.log(`Available columns:`, Object.keys(row));
        }
      });
      
      stream.on('end', () => {
        console.log(`CSV parsing complete. Total rows: ${totalRows}, Payee records found: ${rowIndex}`);
        payeeStream.push(null);
      });
      
      stream.on('error', (err) => {
        console.error('CSV parsing error:', err);
        payeeStream.destroy(err);
      });
      
    } catch (err) {
      console.error('Error setting up CSV stream:', err);
      payeeStream.destroy(err as Error);
    }
    
    return payeeStream;
  }
  
  private async convertExcelToCsv(excelFilePath: string): Promise<string> {
    console.log(`📊 Converting Excel file to CSV (streaming): ${excelFilePath}`);
    
    try {
      const workbook = XLSX.readFile(excelFilePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      console.log(`📊 Streaming sheet "${sheetName}" to CSV`);
      
      // Stream to CSV file instead of building giant string in memory
      const csvFilePath = excelFilePath + '.csv';
      const writeStream = fs.createWriteStream(csvFilePath);
      
      // Get the range of the worksheet
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      
      // Stream row by row to avoid memory spike
      for (let row = range.s.r; row <= range.e.r; row++) {
        const rowData = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          rowData.push(cell ? String(cell.v || '') : '');
        }
        writeStream.write(rowData.join(',') + '\n');
        
        // Allow event loop to breathe every 100 rows
        if (row % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      await new Promise((resolve, reject) => {
        writeStream.end(() => resolve(undefined));
        writeStream.on('error', reject);
      });
      
      console.log(`📊 Excel streamed to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (err) {
      console.error(`📊 Excel to CSV streaming error:`, err);
      throw err;
    }
  }
  
  private async processPayeeStream(
    batchId: number,
    stream: Readable,
    signal: AbortSignal
  ): Promise<void> {
    const BATCH_SIZE = 100; // Further reduced for memory safety
    const MAX_CONCURRENT = 16; // Aligned with database pool
    let buffer: PayeeData[] = [];
    let totalProcessed = 0;
    let startTime = Date.now();
    
    console.log(`processPayeeStream started for batch ${batchId}`);
    
    // Get the batch to retrieve the already-set totalRecords
    const batch = await storage.getUploadBatch(batchId);
    const totalRecords = batch?.totalRecords || 0;
    console.log(`Processing stream with fixed total of ${totalRecords} records`);
    
    // Process stream
    console.log(`About to process stream...`);
    let recordCount = 0; // Just for counting, not updating totalRecords
    for await (const payeeData of stream) {
      if (signal.aborted) {
        console.log(`Job ${batchId} was aborted`);
        break;
      }
      
      buffer.push(payeeData);
      recordCount++;
      
      if (recordCount <= 3) {
        console.log(`Received payee record ${recordCount}:`, payeeData.originalName);
      }
      
      if (buffer.length >= BATCH_SIZE) {
        await this.processBatch(batchId, buffer, totalProcessed, totalRecords, signal);
        totalProcessed += buffer.length;
        buffer = [];
        
        // Update progress (but NOT totalRecords - it stays fixed!)
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const recordsPerSecond = totalProcessed / elapsedSeconds;
        await storage.updateUploadBatch(batchId, {
          processedRecords: totalProcessed,
          // DO NOT update totalRecords - keep denominator fixed!
          currentStep: `Processing at ${recordsPerSecond.toFixed(1)} records/sec`,
          progressMessage: `Processing... ${totalProcessed} of ${totalRecords} records`
        });
      }
    }
    
    // Process remaining buffer
    if (buffer.length > 0 && !signal.aborted) {
      await this.processBatch(batchId, buffer, totalProcessed, totalRecords, signal);
      totalProcessed += buffer.length;
    }
    
    // Finalize
    if (!signal.aborted) {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const recordsPerSecond = totalProcessed / elapsedSeconds;
      
      // Calculate accuracy using SQL aggregation (memory efficient)
      const accuracy = await storage.getBatchAccuracy(batchId);
      
      // Update batch to enriching status now that classification is done
      await storage.updateUploadBatch(batchId, {
        status: "enriching", // Change to enriching status
        processedRecords: totalProcessed,
        totalRecords,
        accuracy,
        currentStep: "Starting enrichment",
        progressMessage: `Classification completed! Starting enrichment for ${totalProcessed} records...`,
        // Don't set completedAt yet - wait until ALL enrichment is done
      });
      
      // Start enrichment processes with proper sequencing
      // Order: Finexio → Google Address → Mastercard → Akkio
      
      // 1. Start Finexio matching first
      const enrichmentPromises = [
        this.startFinexioMatching(batchId).catch(error => {
          console.error('Error starting Finexio matching:', error);
        })
      ];
      
      // Check if address validation is enabled
      const batch = await storage.getUploadBatch(batchId);
      const addressColumns = batch?.addressColumns as any;
      const hasAddressData = addressColumns && (addressColumns.address || addressColumns.city || addressColumns.state || addressColumns.zipCode);
      
      console.log(`📍 Checking address validation for batch ${batchId}:`, {
        hasAddressData,
        addressColumns,
        matchingOptions: this.matchingOptions
      });
      
      if (hasAddressData && this.matchingOptions?.enableGoogleAddressValidation) {
        console.log(`🗺️ Starting address validation for batch ${batchId}`);
        const addressValidationPromise = this.startAddressValidation(batchId)
          .then(() => {
            // After address validation completes, start Mastercard enrichment
            console.log(`✅ Address validation completed for batch ${batchId}, now starting Mastercard enrichment`);
            return this.startEnrichmentProcess(batchId).catch(error => {
              console.error('Error starting Mastercard enrichment after address validation:', error);
            });
          })
          .catch(error => {
            console.error('Error starting address validation:', error);
            // Even if address validation fails, try Mastercard enrichment
            console.log(`⚠️ Address validation failed for batch ${batchId}, trying Mastercard enrichment anyway`);
            return this.startEnrichmentProcess(batchId).catch(error => {
              console.error('Error starting Mastercard enrichment after failed address validation:', error);
            });
          });
        
        enrichmentPromises.push(addressValidationPromise);
      } else {
        // No address validation needed - set status to skipped immediately
        console.log(`🎯 No address validation needed for batch ${batchId}, marking as skipped`);
        
        // Set Google Address status to skipped since it's not enabled
        if (!this.matchingOptions?.enableGoogleAddressValidation) {
          await storage.updateUploadBatch(batchId, {
            googleAddressStatus: "skipped",
            googleAddressCompletedAt: new Date()
          });
        }
        
        // Run Mastercard enrichment directly
        enrichmentPromises.push(
          this.startEnrichmentProcess(batchId).catch(error => {
            console.error('Error starting Mastercard enrichment directly:', error);
          })
        );
      }
      
      // Mark Akkio as skipped immediately if it's disabled
      if (!this.matchingOptions?.enableAkkio) {
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date()
        });
      }
      
      // Wait for all enrichment processes to complete
      Promise.all(enrichmentPromises)
        .then(async () => {
          // After all enrichments complete, start Akkio predictions as the final step (if enabled)
          if (this.matchingOptions?.enableAkkio) {
            console.log(`All enrichments completed for batch ${batchId}, starting Akkio predictions`);
            
            // Start Akkio predictions - this will mark batch as completed when done
            try {
              await this.startAkkioPredictions(batchId);
            } catch (error) {
              console.error('Akkio predictions failed, marking batch as completed anyway:', error);
              // If Akkio fails, still mark batch as completed since main processing is done
              await storage.updateUploadBatch(batchId, {
                status: "completed",
                completedAt: new Date(),
                currentStep: "Processing complete",
                progressMessage: `Processing completed with Akkio unavailable. Classification, Finexio matching, and Mastercard enrichment done.`
              });
            }
          } else {
            console.log(`All enrichments completed for batch ${batchId}, Akkio is disabled - marking batch as complete`);
            // Akkio is disabled, mark batch as completed after enrichments
            await this.checkAndUpdateBatchCompletion(batchId);
          }
        })
        .catch(async (error) => {
          console.error('Error in enrichment pipeline:', error);
          // Even if enrichment fails, mark batch as completed since classification was done
          await storage.updateUploadBatch(batchId, {
            status: "completed",
            completedAt: new Date(),
            currentStep: "Processing complete with errors",
            progressMessage: `Processing completed with some enrichment errors. Check logs for details.`
          });
        });
      
      console.log(`Batch ${batchId} classification completed: ${totalProcessed} records in ${elapsedSeconds}s (${recordsPerSecond.toFixed(1)} rec/s)`);
    }
  }
  
  private async processBatch(
    batchId: number,
    payees: PayeeData[],
    processedSoFar: number,
    totalRecords: number,
    signal: AbortSignal
  ): Promise<void> {
    const classifications: InsertPayeeClassification[] = [];
    
    console.log(`Processing batch of ${payees.length} payees for batch ${batchId}`);
    const batchStartTime = Date.now();
    
    // Enhanced duplicate tracking with duplicate IDs
    const duplicateGroups = new Map<string, string>(); // normalized name -> duplicate ID
    const duplicateIdMap = new Map<string, number>(); // duplicate ID -> count
    let duplicateIdCounter = 1;
    let duplicatesFound = 0;
    let lowConfidenceCount = 0;
    
    // First pass: Build duplicate groups by analyzing all names
    const normalizedPayees: Array<{original: string, normalized: string, superNormalized: string}> = [];
    for (const payee of payees) {
      const normalized = this.normalizePayeeName(payee.originalName);
      const superNormalized = this.superNormalizeForDuplicates(payee.originalName); // Should use original, not normalized
      console.log(`Duplicate check: "${payee.originalName}" → super: "${superNormalized}"`);
      normalizedPayees.push({
        original: payee.originalName,
        normalized: normalized,
        superNormalized: superNormalized
      });
    }
    
    // Find duplicate groups using super normalization
    const groupsMap = new Map<string, string[]>(); // superNormalized -> array of original names
    for (const np of normalizedPayees) {
      if (!groupsMap.has(np.superNormalized)) {
        groupsMap.set(np.superNormalized, []);
      }
      groupsMap.get(np.superNormalized)!.push(np.original);
    }
    
    // First pass: Assign duplicate IDs to groups with more than one member
    for (const [superNorm, names] of groupsMap) {
      if (names.length > 1) {
        const duplicateId = `duplicate_id${duplicateIdCounter}`;
        duplicateIdCounter++;
        for (const name of names) {
          duplicateGroups.set(name, duplicateId); // Store with original casing
        }
        console.log(`Found duplicate group ${duplicateId}: ${names.join(', ')}`);
      }
    }
    
    // Second pass: Check for potential duplicates that normalization might have missed
    // This handles edge cases like "JPMorgan Chase" vs "Chase Bank"
    const ungroupedPayees = normalizedPayees.filter(np => !duplicateGroups.has(np.original));
    if (ungroupedPayees.length > 1 && ungroupedPayees.length <= 20) {
      // Only use AI for small batches to avoid high costs
      const potentialDuplicates = await this.findAIPotentialDuplicates(ungroupedPayees);
      for (const group of potentialDuplicates) {
        if (group.length > 1) {
          const duplicateId = `duplicate_id${duplicateIdCounter}`;
          duplicateIdCounter++;
          for (const name of group) {
            duplicateGroups.set(name, duplicateId); // Store with original casing
          }
          console.log(`AI found duplicate group ${duplicateId}: ${group.join(', ')}`);
        }
      }
    }
    
    // Process all payees in a single batch request
    try {
      if (signal.aborted) return;
      
      const results = await this.classifyBatch(payees);
      const batchTime = (Date.now() - batchStartTime) / 1000;
      console.log(`Processed batch of ${payees.length} in ${batchTime}s (${(payees.length/batchTime).toFixed(1)} rec/s)`);
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const payee = payees[j];
        const normalizedName = this.normalizePayeeName(payee.originalName);
        
        // Check if this payee belongs to a duplicate group
        const duplicateId = duplicateGroups.get(payee.originalName);
        if (duplicateId) {
          duplicatesFound++;
          // Include duplicate ID in reasoning
          result.reasoning = `[${duplicateId}] ${result.reasoning}`;
        }
        
        // Save all records, but flag low confidence ones for review
        const flagForReview = result.confidence < 0.95 || result.flagForReview;
        if (flagForReview) {
          lowConfidenceCount++;
        }
        
        classifications.push({
          batchId,
          originalName: payee.originalName,
          cleanedName: normalizedName,
          address: payee.address || null,
          city: payee.city || null,
          state: payee.state || null,
          zipCode: payee.zipCode || null,
          payeeType: result.payeeType,
          confidence: result.confidence,
          sicCode: result.sicCode || null,
          sicDescription: result.sicDescription || null,
          status: flagForReview ? "pending-review" : "auto-classified",
          originalData: payee.originalData,
          reasoning: result.reasoning,
          isExcluded: result.isExcluded || false,
          exclusionKeyword: result.exclusionKeyword || null,
        });
      }
      
      console.log(`Batch summary: ${duplicatesFound} duplicates, ${lowConfidenceCount} flagged for review`);
    } catch (error) {
      console.error(`Batch processing error:`, error);
      // Process with fallback classification for failed records
      for (const payee of payees) {
        classifications.push({
          batchId,
          originalName: payee.originalName,
          cleanedName: this.normalizePayeeName(payee.originalName),
          address: payee.address || null,
          city: payee.city || null,
          state: payee.state || null,
          zipCode: payee.zipCode || null,
          payeeType: "Individual",
          confidence: 0.5,
          sicCode: null,
          sicDescription: null,
          status: "pending-review",
          originalData: payee.originalData,
          reasoning: `Classification failed: ${error.message}. Defaulted to Individual with low confidence.`,
          isExcluded: false,
          exclusionKeyword: null,
        });
      }
    }
    
    // Save classifications in larger batches for better performance
    const SAVE_BATCH_SIZE = 500;
    console.log(`Saving ${classifications.length} classifications for batch ${batchId}`);
    
    if (classifications.length === 0) {
      console.warn(`No classifications to save for batch ${batchId} - all records may have been duplicates`);
    }
    
    for (let i = 0; i < classifications.length; i += SAVE_BATCH_SIZE) {
      const batch = classifications.slice(i, i + SAVE_BATCH_SIZE);
      console.log(`Saving batch ${i/SAVE_BATCH_SIZE + 1}: ${batch.length} records`);
      await storage.createPayeeClassifications(batch);
    }
  }
  


  private async checkAndUpdateBatchCompletion(batchId: number): Promise<void> {
    try {
      // Check if all modules are complete for the batch
      const batch = await storage.getUploadBatch(batchId);
      if (!batch) {
        console.error(`Batch ${batchId} not found`);
        return;
      }

      const isClassificationComplete = batch.classificationStatus === "completed" || batch.classificationStatus === "skipped";
      const isFinexioComplete = batch.finexioMatchingStatus === "completed" || batch.finexioMatchingStatus === "skipped";
      const isMastercardComplete = batch.mastercardEnrichmentStatus === "completed" || batch.mastercardEnrichmentStatus === "skipped";
      const isAkkioComplete = batch.akkioPredictionStatus === "completed" || batch.akkioPredictionStatus === "skipped";

      if (isClassificationComplete && isFinexioComplete && isMastercardComplete && isAkkioComplete) {
        console.log(`All modules complete for batch ${batchId}, marking batch as completed`);
        await storage.updateUploadBatch(batchId, {
          status: "completed",
          completedAt: new Date(),
          currentStep: "Processing complete",
          progressMessage: `Processing completed. Classification: ${batch.classificationStatus}, Finexio: ${batch.finexioMatchingStatus}, Mastercard: ${batch.mastercardEnrichmentStatus}, Akkio: ${batch.akkioPredictionStatus}`
        });
      } else {
        console.log(`Batch ${batchId} modules not yet complete. Classification: ${batch.classificationStatus}, Finexio: ${batch.finexioMatchingStatus}, Mastercard: ${batch.mastercardEnrichmentStatus}, Akkio: ${batch.akkioPredictionStatus}`);
      }
    } catch (error) {
      console.error(`Error checking batch completion for batch ${batchId}:`, error);
    }
  }

  private async performOpenAIClassification(payee: PayeeData): Promise<ClassificationResult> {
    try {
      // Rate limiting is handled at the route level
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Use GPT-4o for best accuracy
        messages: [{
          role: "system",
          content: `Classify payees into these categories with HIGH CONFIDENCE (95%+):

CATEGORIES:
• Individual: Personal names, employees, contractors, students (includes Individual/Contractors, Employees, Students)
• Business: Companies with LLC/INC/CORP suffixes, brand names, commercial entities, ANY unknown company names
• Government: City/County/State agencies, departments, tax authorities (includes Tax/Government)
• Insurance: Insurance companies, carriers, brokers, agents
• Banking: Banks, credit unions, financial institutions
• Internal Transfer: ONLY when explicitly mentions "transfer", "internal transfer", or clear internal company references

CLASSIFICATION RULES:
- Individual: Clear personal names (First Last pattern), employee payroll entries
- Business: ANY company name, brand name, business entity - if unsure, default to Business
- Government: Government agencies, tax authorities, municipal departments, state/federal entities
- Insurance: Insurance-related entities, carriers, brokers, agents
- Banking: Banks, credit unions, financial institutions, payment processors
- Internal Transfer: ONLY when text explicitly contains "transfer", "internal", or clear inter-company language

IMPORTANT: Only request web search for truly unidentifiable text/gibberish. Most business names should be classified as "Business" even if unfamiliar.

If genuinely cannot identify (gibberish/unclear text only), respond with:
{"needsWebSearch": true, "searchQuery": "exact company or entity name to search"}

CONFIDENCE TARGETS:
- Only return confidence 0.95+ for high-certainty classifications
- Business entities with clear suffixes (LLC, INC, CORP) = 0.98+ confidence
- Government agencies with clear prefixes (City of, County of, State of) = 0.98+ confidence
- Clear personal names (First Last pattern) = 0.96+ confidence

Return JSON:
{"payeeType":"Individual|Business|Government|Insurance|Banking|Internal Transfer","confidence":0.95-0.99,"sicCode":"XXXX","sicDescription":"Industry description","reasoning":"Brief classification reason","flagForReview":false}

OR if uncertain:
{"needsWebSearch":true,"searchQuery":"company name to research"}`
        }, {
          role: "user",
          content: `Classify this payee: "${payee.originalName}"${payee.address ? `, Address: ${payee.address}` : ''}
          
CRITICAL: Classify ALL recognizable company names as "Business" immediately. Only request web search for truly unreadable gibberish or completely unclear text. Examples:
- "prosalutem" = Business (unknown company, still a business)
- "Microsoft" = Business
- "John Smith" = Individual  
- "XJKL999###" = needsWebSearch (gibberish only)`
        }],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });
      
      const responseContent = response.choices[0].message.content || '{}';
      let result: any;
      
      try {
        result = JSON.parse(responseContent);
      } catch (parseError) {
        console.error(`JSON parse error for ${payee.originalName}:`, parseError.message);
        // If parsing fails, try web search as fallback
        return await this.performWebSearchClassification(payee, payee.originalName);
      }
      
      // If OpenAI suggests web search, perform it
      if (result.needsWebSearch && result.searchQuery) {
        return await this.performWebSearchClassification(payee, result.searchQuery);
      }
      
      const classification: ClassificationResult = {
        payeeType: result.payeeType || "Unknown",
        confidence: Math.min(Math.max(result.confidence || 0.85, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || "Classified based on available information",
        flagForReview: result.flagForReview || result.confidence < 0.95
      };
      
      return classification;
    } catch (error) {
      console.error(`OpenAI API error for ${payee.originalName}:`, error.message);
      
      // Try web search as fallback for API errors
      return await this.performWebSearchClassification(payee, payee.originalName);
    }
  }

  private async performWebSearchClassification(payee: PayeeData, searchQuery: string): Promise<ClassificationResult> {
    try {
      console.log(`Web searching for: ${searchQuery}`);
      
      // Use the actual web_search function available in Replit environment
      let searchResult: string;
      try {
        // Try to use the global web_search function
        if (typeof (global as any).web_search === 'function') {
          searchResult = await (global as any).web_search({ query: `${searchQuery} company business information` });
        } else {
          // Fallback to enhanced OpenAI approach
          searchResult = await this.fallbackWebSearch({ query: `${searchQuery} company business information` });
        }
      } catch (error) {
        console.log(`Web search failed, using fallback: ${error.message}`);
        searchResult = await this.fallbackWebSearch({ query: `${searchQuery} company business information` });
      }
      
      // Use OpenAI to classify based on search results
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: `Based on web search results, classify this payee into categories:

CATEGORIES:
• Individual: Personal names, employees, contractors, students
• Business: Companies, corporations, commercial entities, brands
• Government: Government agencies, departments, municipalities
• Insurance: Insurance companies, carriers, brokers
• Banking: Banks, credit unions, financial institutions  
• Internal Transfer: Internal company transfers only

Provide high confidence (95%+) classification based on the search results.

Return JSON:
{"payeeType":"Individual|Business|Government|Insurance|Banking|Internal Transfer","confidence":0.95-0.99,"sicCode":"XXXX","sicDescription":"Industry description","reasoning":"Web search enhanced: [key findings]","flagForReview":false}`
        }, {
          role: "user", 
          content: `Classify "${payee.originalName}" based on these search results:\n\n${searchResult.slice(0, 2000)}`
        }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 600
      });

      const responseContent = response.choices[0].message.content;
      const result = JSON.parse(responseContent);
      
      return {
        payeeType: result.payeeType || "Business",
        confidence: Math.min(Math.max(result.confidence || 0.95, 0), 1),
        sicCode: result.sicCode,
        sicDescription: result.sicDescription,
        reasoning: result.reasoning || `Web search enhanced classification for ${payee.originalName}`,
        flagForReview: result.flagForReview || false
      };

    } catch (error) {
      console.error(`Web search classification error for ${payee.originalName}:`, error.message);
      
      // Enhanced fallback logic - use ChatGPT to make best guess without web search
      console.log(`Falling back to pattern-based classification for: ${payee.originalName}`);
      
      try {
        const fallbackResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `Classify this payee using your knowledge base only (no web search available):

CATEGORIES: Individual, Business, Government, Insurance, Banking, Internal Transfer

Make your best classification based on the name pattern and any knowledge you have.
If it looks like a business name but you're unsure of the type, classify as "Business".
If it's clearly a personal name (First Last), classify as "Individual".

Return JSON:
{"payeeType":"Individual|Business|Government|Insurance|Banking|Internal Transfer","confidence":0.85-0.95,"sicCode":null,"sicDescription":null,"reasoning":"Classified without web search based on name pattern and knowledge","flagForReview":false}`
          }, {
            role: "user",
            content: `Classify: "${payee.originalName}"`
          }],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 300
        });
        
        const fallbackContent = fallbackResponse.choices[0].message.content;
        const fallbackResult = JSON.parse(fallbackContent);
        
        return {
          payeeType: fallbackResult.payeeType || "Business",
          confidence: Math.min(Math.max(fallbackResult.confidence || 0.85, 0), 1),
          sicCode: null,
          sicDescription: null,
          reasoning: `${fallbackResult.reasoning} (Web search failed: ${error.message})`,
          flagForReview: true
        };
      } catch (fallbackError) {
        console.error(`Fallback classification failed for ${payee.originalName}:`, fallbackError.message);
        
        // Final pattern-based fallback
        const isPersonalName = /^[A-Za-z]+\s+[A-Za-z]+$/.test(payee.originalName.trim());
        
        return {
          payeeType: isPersonalName ? "Individual" : "Business",
          confidence: 0.75,
          sicCode: null,
          sicDescription: null,
          reasoning: `Pattern-based classification: ${isPersonalName ? 'Personal name pattern' : 'Business name pattern'}. Web search and OpenAI fallback failed.`,
          flagForReview: true
        };
      }
    }
  }
  
  private normalizePayeeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\b(llc|incorporated|inc|corp|corporation|co|company|ltd|limited|lp|llp|pllc|plc|enterprises|enterprise|ent|group|services|service|solutions|solution|associates|assoc|partners|partnership|holdings|holding|international|intl|global|worldwide|systems|system|technologies|technology|tech|industries|industry|consulting|consultants|consultant|management|mgmt|development|dev|investments|investment|capital|ventures|venture|properties|property|realty|trust|foundation|institute|organization|org|association|assn|society|club)\b/g, '')
      .replace(/\s+/g, ' ') // Normalize spaces again after removal
      .trim();
  }
  
  private superNormalizeForDuplicates(name: string): string {
    // Ultra-aggressive normalization for duplicate detection
    let normalized = name.toLowerCase();
    
    // Remove numbers in parentheses like (123), (211), etc.
    normalized = normalized.replace(/\s*\(\d+\)\s*/g, ' ');
    
    // First remove ALL punctuation but keep spaces
    normalized = normalized.replace(/[^\w\s]/g, ' ');
    
    // Remove common business suffixes FIRST (before removing product descriptors)
    // This ensures "Pepsi Cola Company" -> "Pepsi Cola" -> "Pepsi"
    const businessSuffixes = [
      'llc', 'incorporated', 'inc', 'corp', 'corporation', 'co', 'company', 'companies',
      'ltd', 'limited', 'lp', 'llp', 'pllc', 'plc', 'pc', 'pa',
      'enterprises', 'enterprise', 'ent', 'group', 'grp',
      'services', 'service', 'svcs', 'svc',
      'solutions', 'solution', 'soln',
      'associates', 'assoc', 'assocs',
      'partners', 'partnership', 'ptnr', 'ptr',
      'holdings', 'holding', 'hldg',
      'international', 'intl', 'global', 'worldwide',
      'systems', 'system', 'sys',
      'technologies', 'technology', 'tech',
      'industries', 'industry', 'ind',
      'consulting', 'consultants', 'consultant', 'consult',
      'management', 'mgmt', 'mgm',
      'development', 'dev', 'developers',
      'investments', 'investment', 'invest',
      'capital', 'ventures', 'venture', 'vc',
      'properties', 'property', 'prop',
      'realty', 'real estate', 'realtors',
      'trust', 'foundation', 'institute', 'institution',
      'organization', 'org', 'association', 'assn', 'assoc',
      'society', 'club', 'center', 'centre'
    ];
    
    // Create regex to remove business suffixes
    const suffixRegex = new RegExp(`\\b(${businessSuffixes.join('|')})\\b`, 'gi');
    normalized = normalized.replace(suffixRegex, ' ');
    
    // Remove common product/service descriptors that customers might add
    const productDescriptors = [
      'cola', 'soda', 'beverage', 'beverages', 'drink', 'drinks',
      'products', 'product', 'prod', 'brands', 'brand',
      'foods', 'food', 'restaurant', 'restaurants', 'resto',
      'cafe', 'coffee', 'pizza', 'burger', 'burgers',
      'bank', 'banking', 'financial', 'finance', 'insurance', 'ins',
      'agency', 'agencies',
      'store', 'stores', 'shop', 'shops', 'shopping',
      'market', 'markets', 'supermarket', 'mart',
      'pharmacy', 'drug', 'drugs', 'medical', 'health', 'healthcare',
      'gas', 'gasoline', 'fuel', 'station', 'stations', 'petroleum',
      'hotel', 'hotels', 'motel', 'motels', 'inn', 'lodge', 'resort',
      'airlines', 'airline', 'airways', 'air', 'flights', 'aviation',
      'rental', 'rentals', 'rent', 'leasing', 'lease',
      'wireless', 'mobile', 'cellular', 'phone', 'phones', 'communications', 'comm',
      'internet', 'broadband', 'cable', 'satellite', 'streaming', 'network',
      'shipping', 'freight', 'delivery', 'express', 'logistics', 'transport',
      'retail', 'wholesale', 'distribution', 'supply', 'supplies', 'supplier'
    ];
    
    // Create regex to remove these descriptors
    const descriptorRegex = new RegExp(`\\b(${productDescriptors.join('|')})\\b`, 'gi');
    normalized = normalized.replace(descriptorRegex, ' ');
    
    // Remove address-related words
    const addressWords = [
      'street', 'str', 'st', 'avenue', 'ave', 'av',
      'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr',
      'lane', 'ln', 'court', 'ct', 'place', 'pl',
      'circle', 'cir', 'highway', 'hwy', 'parkway', 'pkwy',
      'way', 'suite', 'ste', 'building', 'bldg',
      'floor', 'fl', 'unit', 'apt', 'apartment', 'room', 'rm'
    ];
    
    const addressRegex = new RegExp(`\\b(${addressWords.join('|')})\\b`, 'gi');
    normalized = normalized.replace(addressRegex, ' ');
    
    // Remove directionals
    normalized = normalized.replace(/\b(north|south|east|west|n|s|e|w|ne|nw|se|sw)\b/gi, ' ');
    
    // Remove ALL remaining non-alphanumeric characters and collapse spaces
    normalized = normalized.replace(/[^a-z0-9\s]/g, '');
    normalized = normalized.replace(/\s+/g, ''); // Remove all spaces for final comparison
    
    return normalized.trim();
  }
  
  private async findAIPotentialDuplicates(payees: Array<{original: string, normalized: string, superNormalized: string}>): Promise<string[][]> {
    // Use AI to find potential duplicates that normalization might miss
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: `Group payee names that refer to the same entity. Consider variations, subsidiaries, and common abbreviations.
Return JSON array of groups where each group contains names that should be considered duplicates.
Example: [["JPMorgan Chase", "Chase Bank"], ["Bank of America", "BofA"]]`
        }, {
          role: "user",
          content: `Find duplicate groups in: ${payees.map(p => p.original).join(', ')}`
        }],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content || '{"groups":[]}');
      return result.groups || [];
    } catch (error) {
      console.error('AI duplicate detection error:', error);
      return [];
    }
  }
  
  private findNameColumn(row: Record<string, any>): string | null {
    const nameVariations = ['supplier name', 'vendor_name', 'payee_name', 'name', 'payee', 'vendor', 'supplier', 'company'];
    const keys = Object.keys(row);
    
    // Log available columns on first row
    console.log(`Available columns in CSV: ${keys.join(', ')}`);
    
    // First try exact match (case insensitive)
    for (const variation of nameVariations) {
      const found = keys.find(key => key.toLowerCase() === variation.toLowerCase());
      if (found) {
        console.log(`Found name column by exact match: ${found}`);
        return found;
      }
    }
    
    // Then try contains match
    for (const variation of nameVariations) {
      const found = keys.find(key => key.toLowerCase().includes(variation));
      if (found) {
        console.log(`Found name column by partial match: ${found}`);
        return found;
      }
    }
    
    console.log(`Using first column as default: ${keys[0]}`);
    return keys[0]; // Default to first column
  }
  
  // Fast-path classification for obvious patterns (saves OpenAI API calls)
  private tryFastPathClassification(name: string): ClassificationResult | null {
    const cleanName = name.trim().toUpperCase();
    
    // Pattern 1: Government entities
    const govPatterns = [
      'IRS', 'DMV', 'DEPT', 'DEPARTMENT', 'STATE OF', 'CITY OF', 'COUNTY OF',
      'FEDERAL', 'MUNICIPAL', 'GOVERNMENT', 'PUBLIC', 'TREASURY',
      'POLICE', 'FIRE DEPT', 'COURT', 'DISTRICT'
    ];
    
    for (const pattern of govPatterns) {
      if (cleanName.includes(pattern)) {
        return {
          payeeType: 'Government',
          confidence: 0.95,
          reasoning: `Contains government keyword: ${pattern}`,
          sicCode: '9199',
          sicDescription: 'General Government, Not Elsewhere Classified'
        };
      }
    }
    
    // Pattern 2: Individual names (FirstName LastName format)
    const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
    if (namePattern.test(name.trim())) {
      // Check it's not a business with a person's name
      const bizSuffixes = ['LLC', 'INC', 'CORP', 'CO', 'LTD', 'GROUP', 'PARTNERS'];
      const hasBusinessSuffix = bizSuffixes.some(suffix => 
        cleanName.includes(suffix.toUpperCase())
      );
      
      if (!hasBusinessSuffix) {
        return {
          payeeType: 'Individual',
          confidence: 0.90,
          reasoning: 'Name follows FirstName LastName pattern',
          sicCode: '8811',
          sicDescription: 'Private Households'
        };
      }
    }
    
    // Pattern 3: Obvious business suffixes
    const businessSuffixes = [
      'LLC', 'L.L.C.', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION',
      'COMPANY', 'CO', 'LTD', 'LIMITED', 'GROUP', 'PARTNERS', 'PARTNERSHIP',
      'ASSOCIATES', 'ENTERPRISES', 'HOLDINGS', 'SOLUTIONS', 'SERVICES'
    ];
    
    for (const suffix of businessSuffixes) {
      if (cleanName.endsWith(suffix) || cleanName.endsWith(suffix + '.')) {
        return {
          payeeType: 'Business',
          confidence: 0.95,
          reasoning: `Contains business suffix: ${suffix}`,
          sicCode: '7389',
          sicDescription: 'Business Services, Not Elsewhere Classified'
        };
      }
    }
    
    // No fast-path match found
    return null;
  }
  
  // New batch classification method for better performance
  private async classifyBatch(payees: PayeeData[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    
    // Process in parallel without delays for maximum speed
    const promises = payees.map(payee => this.classifyPayee(payee));
    
    const classificationResults = await Promise.all(promises);
    return classificationResults;
  }
  
  // Public method for single payee classification
  async classifyPayee(payeeData: PayeeData): Promise<ClassificationResult> {
    // Always perform full classification first
    let result: ClassificationResult;
    
    // Try fast-path classification first for obvious patterns
    const fastPathResult = this.tryFastPathClassification(payeeData.originalName);
    if (fastPathResult) {
      console.log(`⚡ Fast-path classification for "${payeeData.originalName}": ${fastPathResult.payeeType} (${(fastPathResult.confidence * 100).toFixed(0)}% confidence)`);
      result = fastPathResult;
    } else {
      // Perform OpenAI classification for non-obvious cases
      const openaiResult = await this.performOpenAIClassification(payeeData, payeeData.originalName);
      
      // If confidence is high enough, use OpenAI result
      if (openaiResult.confidence >= 0.80) {
        result = openaiResult;
      } else {
        // Try web search for low confidence cases
        if ((this as any).shouldTriggerWebSearch && (this as any).shouldTriggerWebSearch(payeeData.originalName, openaiResult.confidence)) {
          try {
            const webSearchResult = await this.performWebSearchClassification(payeeData, payeeData.originalName);
            // Use web search result if it has higher confidence
            result = webSearchResult.confidence > openaiResult.confidence ? webSearchResult : openaiResult;
          } catch (error: any) {
            console.log(`Web search failed for ${payeeData.originalName}: ${error?.message || 'Unknown error'}`);
            result = openaiResult;
          }
        } else {
          result = openaiResult;
        }
      }
    }

    // Now check for exclusion and mark accordingly (but keep the classification)
    const exclusionResult = await keywordExclusionService.checkExclusion(payeeData.originalName);
    if (exclusionResult.isExcluded) {
      return {
        ...result,
        reasoning: `${exclusionResult.reason || "Excluded by keyword filter"}. Original classification: ${result.reasoning}`,
        isExcluded: true,
        exclusionKeyword: (exclusionResult as any).exclusionKeyword || exclusionResult.matchedKeyword
      };
    }

    return result;
  }

  private async fallbackWebSearch(params: { query: string }): Promise<string> {
    // Enhanced fallback that uses OpenAI to simulate web search knowledge
    console.log(`Using fallback search for: ${params.query}`);
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system", 
          content: `You are simulating a web search result. Based on your knowledge, provide information about the entity being searched for. Focus on identifying what type of organization/entity it is.`
        }, {
          role: "user",
          content: `Search for: ${params.query}`
        }],
        temperature: 0,
        max_tokens: 300
      });
      
      return response.choices[0].message.content || `No specific information found for ${params.query}. Appears to be a business entity based on name pattern.`;
    } catch (error) {
      return `Searched for: ${params.query}. This appears to be a business entity based on the search query pattern.`;
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

  // Start Finexio matching process
  private async startFinexioMatching(batchId: number): Promise<void> {
    try {
      // Check if Finexio matching is disabled
      if (this.matchingOptions?.enableFinexio === false) {
        console.log(`Finexio matching disabled for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          finexioMatchingStatus: "skipped",
          finexioMatchingCompletedAt: new Date()
        });
        return;
      }

      console.log(`⚡ Starting OPTIMIZED Finexio matching for batch ${batchId}`);
      
      // Update status to in_progress
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: "in_progress",
        finexioMatchingStartedAt: new Date()
      });

      // Import the FASTEST matching service
      const { optimizedFinexioMatching } = await import('./optimizedFinexioMatching');

      // Get all classifications for the batch
      const classifications = await storage.getBatchClassifications(batchId);
      console.log(`Found ${classifications.length} classifications for Finexio matching`);

      // Process in chunks to prevent memory exhaustion
      const CHUNK_SIZE = 100; // Process 100 records at a time
      let matchedCount = 0;
      let totalProcessed = 0;
      
      const startTime = Date.now();
      
      // Process in chunks for memory safety
      for (let i = 0; i < classifications.length; i += CHUNK_SIZE) {
        const chunk = classifications.slice(i, Math.min(i + CHUNK_SIZE, classifications.length));
        const chunkStartTime = Date.now();
        
        // Use optimized batch processing
        const payeeNames = chunk.map(c => c.originalName || c.cleanedName);
        const results = await optimizedFinexioMatching.batchMatch(payeeNames, 50);
        
        // Count matches
        const chunkMatches = results.filter(r => r.matched).length;
        matchedCount += chunkMatches;
        totalProcessed += chunk.length;
        
        const chunkTime = Date.now() - chunkStartTime;
        const rate = (chunk.length / (chunkTime / 1000)).toFixed(0);
        
        console.log(`⚡ Chunk ${Math.floor(i/CHUNK_SIZE) + 1}: Processed ${chunk.length} records in ${chunkTime}ms (${rate} records/sec, ${chunkMatches} matches)`);
        
        // Update progress
        await storage.updateUploadBatch(batchId, {
          finexioMatchingProgress: totalProcessed,
          finexioMatchingTotal: classifications.length,
          finexioMatchedCount: matchedCount
        });
        
        // Optional: Small delay between chunks to prevent overwhelming the system
        if (i + CHUNK_SIZE < classifications.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalTime = Date.now() - startTime;
      const overallRate = (classifications.length / (totalTime / 1000)).toFixed(0);
      
      console.log(`✅ Finexio matching completed: ${matchedCount}/${classifications.length} matched in ${totalTime}ms (${overallRate} records/sec)`);
      
      // Clear cache periodically to prevent memory bloat
      finexioMatcherV2.clearCache();
      
      const matchPercentage = totalProcessed > 0 ? Math.round((matchedCount / totalProcessed) * 100) : 0;
      
      // Update status to completed
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: "completed",
        finexioMatchingCompletedAt: new Date(),
        finexioMatchingProcessed: totalProcessed,
        finexioMatchingMatched: matchedCount,
        finexioMatchingProgress: 100,
        finexioMatchPercentage: matchPercentage,
        finexioMatchedCount: matchedCount
      });
      
    } catch (error) {
      console.error('Finexio matching process failed:', error);
      await storage.updateUploadBatch(batchId, {
        finexioMatchingStatus: "failed",
        finexioMatchingCompletedAt: new Date()
      });
    }
  }

  // Legacy BigQuery matching (kept for compatibility)
  private async startBigQueryMatching(batchId: number): Promise<void> {
    // Redirect to Finexio matching
    return this.startFinexioMatching(batchId);
  }

  // Start asynchronous enrichment process (Mastercard)
  private async startEnrichmentProcess(batchId: number): Promise<void> {
    try {
      console.log(`🔍 Checking Mastercard enrichment for batch ${batchId}`);
      console.log(`Matching options:`, this.matchingOptions);
      console.log(`Enable Mastercard value:`, this.matchingOptions?.enableMastercard);
      
      // Check if Mastercard enrichment is explicitly disabled
      // Default to true if not specified (to match frontend default)
      const mastercardEnabled = this.matchingOptions?.enableMastercard !== false;
      
      if (!mastercardEnabled) {
        console.log(`❌ Mastercard enrichment explicitly disabled for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "skipped",
          mastercardEnrichmentCompletedAt: new Date()
        });
        return;
      }
      
      console.log(`✅ Mastercard enrichment enabled for batch ${batchId}`);
      
      
      // Only proceed if Mastercard API is configured
      // Import mastercardApi to check if service is configured
      const { mastercardApi } = await import('./mastercardApi');
      
      if (!mastercardApi.isServiceConfigured()) {
        console.log('❌ Mastercard API not configured, skipping enrichment');
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "skipped",
          mastercardEnrichmentCompletedAt: new Date()
        });
        return;
      }
      
      console.log('✅ Mastercard API is configured, proceeding with enrichment');

      // Get business classifications that haven't been enriched yet
      const businessClassifications = await storage.getBusinessClassificationsForEnrichment(batchId);
      
      if (businessClassifications.length === 0) {
        console.log('No business classifications to enrich');
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "completed",
          mastercardEnrichmentCompletedAt: new Date(),
          mastercardEnrichmentProgress: 100
        });
        return;
      }

      // Update status to in_progress
      await storage.updateUploadBatch(batchId, {
        status: "enriching", // Keep status as enriching
        mastercardEnrichmentStatus: "in_progress",
        mastercardEnrichmentStartedAt: new Date(),
        mastercardEnrichmentTotal: businessClassifications.length,
        mastercardEnrichmentProcessed: 0,
        mastercardEnrichmentProgress: 0,
        currentStep: "Running Mastercard enrichment",
        progressMessage: `Running Mastercard enrichment for ${businessClassifications.length} business classifications...`
      });

      console.log(`📦 Starting optimized Mastercard enrichment for ${businessClassifications.length} business classifications`);

      // Import the optimized batch service
      const { mastercardBatchOptimizedService } = await import('./mastercardBatchOptimized');
      
      // Prepare all payees for enrichment
      const payeesForEnrichment = businessClassifications.map(c => ({
        id: c.id.toString(),
        name: c.cleanedName || c.originalName, // Use cleanedName if available, fallback to originalName
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        zipCode: c.zipCode || undefined,
      }));
      
      try {
        // No artificial timeout - let Mastercard service handle its own 20-minute timeout
        // This ensures we wait for proper results or rate limit handling
        const enrichmentResults = await mastercardBatchOptimizedService.enrichBatch(payeesForEnrichment);
        
        // Update database with all results (including timeouts/failures)
        await mastercardBatchOptimizedService.updateDatabaseWithResults(enrichmentResults);
        
        // Count successful enrichments and timeouts
        let successCount = 0;
        let timeoutCount = 0;
        let failureCount = 0;
        enrichmentResults.forEach((result, id) => {
          if (result.enriched) {
            successCount++;
          } else if (result.status === 'timeout') {
            timeoutCount++;
          } else {
            failureCount++;
          }
        });
        
        // Update batch status to completed regardless of individual results
        // The enrichment process is complete even if some/all searches timed out
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "completed",
          mastercardEnrichmentCompletedAt: new Date(),
          mastercardEnrichmentProcessed: businessClassifications.length,
          mastercardEnrichmentProgress: 100
        });
        
        if (timeoutCount > 0) {
          console.log(`⚠️ Mastercard enrichment completed with timeouts: ${successCount} enriched, ${timeoutCount} timed out, ${failureCount} failed out of ${businessClassifications.length} total`);
        } else {
          console.log(`✅ Mastercard enrichment completed: ${successCount}/${businessClassifications.length} successfully enriched`);
        }
        
      } catch (error) {
        console.error('Mastercard batch enrichment failed:', error);
        
        // Mark batch as failed but don't fail the overall processing
        await storage.updateUploadBatch(batchId, {
          mastercardEnrichmentStatus: "failed",
          mastercardEnrichmentCompletedAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error in enrichment process:', error);
      await storage.updateUploadBatch(batchId, {
        mastercardEnrichmentStatus: "failed",
        mastercardEnrichmentCompletedAt: new Date()
      });
    }
  }

  // Start Google Address Validation process
  private async startAddressValidation(batchId: number): Promise<void> {
    try {
      // Get batch details to retrieve addressColumns
      const batch = await storage.getUploadBatch(batchId);
      if (!batch) {
        console.log(`Batch ${batchId} not found`);
        return;
      }
      
      // Check if Google Address Validation is disabled
      if (this.matchingOptions.enableGoogleAddressValidation !== true) {
        console.log(`Google Address Validation disabled for batch ${batchId}`);
        await storage.updateUploadBatch(batchId, {
          googleAddressStatus: "skipped",
          googleAddressCompletedAt: new Date()
        });
        return;
      }

      // Get address columns from batch record or from instance
      const addressColumns = (batch.addressColumns as any) || this.addressColumns || {};
      
      // Check if address columns are mapped
      if (!addressColumns || Object.keys(addressColumns).length === 0) {
        console.log(`No address columns mapped for batch ${batchId}, skipping address validation`);
        await storage.updateUploadBatch(batchId, {
          googleAddressStatus: "skipped",
          googleAddressCompletedAt: new Date()
        });
        return;
      }

      console.log(`Starting Google Address Validation for batch ${batchId}`);
      console.log(`Address columns mapping:`, addressColumns);

      // Update status to in_progress
      await storage.updateUploadBatch(batchId, {
        googleAddressStatus: "in_progress",
        googleAddressStartedAt: new Date()
      });

      // Import address validation service
      const { addressValidationService } = await import('./addressValidationService');

      // Get all classifications for the batch
      const classifications = await storage.getBatchClassifications(batchId);
      console.log(`Found ${classifications.length} classifications for address validation`);

      // Update total count
      await storage.updateUploadBatch(batchId, {
        googleAddressTotal: classifications.length
      });

      // Process address validation
      const result = await addressValidationService.validateBatchAddresses(batchId, classifications, addressColumns);
      
      console.log(`Address validation completed for batch ${batchId}: ${result.validatedCount}/${result.totalProcessed} addresses validated`);
      
      // Update status to completed
      await storage.updateUploadBatch(batchId, {
        googleAddressStatus: "completed",
        googleAddressCompletedAt: new Date(),
        googleAddressProcessed: result.totalProcessed,
        googleAddressValidated: result.validatedCount,
        googleAddressProgress: 100
      });
      
      if (result.errors > 0) {
        console.warn(`Address validation encountered ${result.errors} errors`);
      }
    } catch (error) {
      console.error('Address validation process failed:', error);
      await storage.updateUploadBatch(batchId, {
        googleAddressStatus: "failed",
        googleAddressCompletedAt: new Date()
      });
    }
  }

  // Check if all enrichment processes are complete
  private async isAllEnrichmentComplete(batchId: number): Promise<boolean> {
    const batch = await storage.getUploadBatch(batchId);
    
    if (!batch) {
      console.log(`Batch ${batchId} not found`);
      return true;
    }
    
    // Check Finexio/BigQuery matching status
    const finexioComplete = batch.finexioMatchingStatus === 'completed' || 
                           batch.finexioMatchingStatus === 'failed' || 
                           batch.finexioMatchingStatus === 'skipped' ||
                           !this.matchingOptions.enableFinexio;
    
    // Check Google Address validation status  
    const googleAddressComplete = batch.googleAddressStatus === 'completed' ||
                                  batch.googleAddressStatus === 'failed' ||
                                  batch.googleAddressStatus === 'skipped' ||
                                  !this.matchingOptions.enableGoogleAddressValidation;
    
    // Check Mastercard enrichment status
    const mastercardComplete = batch.mastercardEnrichmentStatus === 'completed' ||
                              batch.mastercardEnrichmentStatus === 'failed' ||
                              batch.mastercardEnrichmentStatus === 'skipped' ||
                              !this.matchingOptions.enableMastercard;
    
    // Check Akkio prediction status
    const akkioComplete = batch.akkioPredictionStatus === 'completed' ||
                         batch.akkioPredictionStatus === 'failed' ||
                         batch.akkioPredictionStatus === 'skipped' ||
                         !this.matchingOptions.enableAkkio;
    
    const allComplete = finexioComplete && googleAddressComplete && mastercardComplete && akkioComplete;
    
    if (!allComplete) {
      console.log(`Enrichment status for batch ${batchId}:
        - Finexio: ${batch.finexioMatchingStatus || 'not started'} (complete: ${finexioComplete})
        - Google Address: ${batch.googleAddressStatus || 'not started'} (complete: ${googleAddressComplete})
        - Mastercard: ${batch.mastercardEnrichmentStatus || 'not started'} (complete: ${mastercardComplete})
        - Akkio: ${batch.akkioPredictionStatus || 'not started'} (complete: ${akkioComplete})`);
    }
    
    return allComplete;
  }
  
  // Wait for all enrichment processes to complete
  private async waitForEnrichmentCompletion(batchId: number): Promise<void> {
    // The batch enrichment monitor handles all enrichment processing now
    // We just need to check once if everything is complete
    const allComplete = await this.isAllEnrichmentComplete(batchId);
    
    if (allComplete) {
      console.log(`All enrichment processes completed for batch ${batchId}`);
      return;
    }
    
    // Don't poll - let the batch enrichment monitor handle it
    console.log(`Enrichment in progress for batch ${batchId}, will be handled by batch enrichment monitor`);
  }

  // Start Akkio predictions as the final enrichment step
  private async startAkkioPredictions(batchId: number): Promise<void> {
    try {
      // Check if Akkio predictions are disabled
      if (this.matchingOptions.enableAkkio !== true) {
        console.log(`Akkio predictions disabled for batch ${batchId}`);
        
        // Get batch to get total records for proper progress display
        const batch = await storage.getUploadBatch(batchId);
        const totalRecords = batch?.processedRecords || batch?.totalRecords || 0;
        
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date(),
          akkioPredictionProgress: totalRecords,
          akkioPredictionProcessed: totalRecords,
          akkioPredictionTotal: totalRecords
        });
        
        // Wait for all enrichment to complete before marking batch as completed
        await this.waitForEnrichmentCompletion(batchId);
        
        // Now mark batch as completed since all processing is done
        const allComplete = await this.isAllEnrichmentComplete(batchId);
        if (allComplete) {
          await storage.updateUploadBatch(batchId, {
            status: "completed",
            completedAt: new Date(),
            currentStep: "All processing complete",
            progressMessage: `Processing completed! Classification, Finexio matching, Google Address validation, and Mastercard enrichment done.`
          });
        }
        return;
      }

      // Check if Akkio API is configured
      if (!process.env.AKKIO_API_KEY) {
        console.log('Akkio API not configured, skipping predictions');
        
        // Get batch to get total records for proper progress display
        const batch = await storage.getUploadBatch(batchId);
        const totalRecords = batch?.processedRecords || batch?.totalRecords || 0;
        
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date(),
          akkioPredictionProgress: totalRecords,
          akkioPredictionProcessed: totalRecords,
          akkioPredictionTotal: totalRecords
        });
        
        // Wait for all enrichment to complete before marking batch as completed
        await this.waitForEnrichmentCompletion(batchId);
        
        // Now mark batch as completed since all processing is done
        const allComplete = await this.isAllEnrichmentComplete(batchId);
        if (allComplete) {
          await storage.updateUploadBatch(batchId, {
            status: "completed",
            completedAt: new Date(),
            currentStep: "All processing complete",
            progressMessage: `Processing completed! Classification, Finexio matching, Google Address validation, and Mastercard enrichment done.`
          });
        }
        return;
      }

      // Get the active Akkio model for payment predictions
      const activeModel = await this.getActiveAkkioModel();
      
      if (!activeModel) {
        console.log('No active Akkio model found, skipping predictions');
        
        // Get batch to get total records for proper progress display
        const batch = await storage.getUploadBatch(batchId);
        const totalRecords = batch?.processedRecords || batch?.totalRecords || 0;
        
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date(),
          akkioPredictionProgress: totalRecords,
          akkioPredictionProcessed: totalRecords,
          akkioPredictionTotal: totalRecords
        });
        
        // Wait for all enrichment to complete before marking batch as completed
        await this.waitForEnrichmentCompletion(batchId);
        
        // Now mark batch as completed since all processing is done
        const allComplete = await this.isAllEnrichmentComplete(batchId);
        if (allComplete) {
          await storage.updateUploadBatch(batchId, {
            status: "completed",
            completedAt: new Date(),
            currentStep: "All processing complete",
            progressMessage: `Processing completed! Classification, Finexio matching, Google Address validation, and Mastercard enrichment done.`
          });
        }
        return;
      }

      console.log(`Starting Akkio predictions for batch ${batchId} using model ${activeModel.name} (${activeModel.akkioModelId})`);

      // Get all classifications that have been enriched but not yet predicted
      const classificationsForPrediction = await storage.getClassificationsForAkkioPrediction(batchId);
      
      if (classificationsForPrediction.length === 0) {
        console.log('No classifications ready for Akkio predictions');
        
        // Get batch to get total records for proper progress display
        const batch = await storage.getUploadBatch(batchId);
        const totalRecords = batch?.processedRecords || batch?.totalRecords || 0;
        
        await storage.updateUploadBatch(batchId, {
          akkioPredictionStatus: "skipped",
          akkioPredictionCompletedAt: new Date(),
          akkioPredictionProgress: totalRecords,
          akkioPredictionProcessed: totalRecords,
          akkioPredictionTotal: totalRecords
        });
        
        // Wait for all enrichment to complete
        await this.waitForEnrichmentCompletion(batchId);
        
        // Mark batch as completed since all processing is done
        const allComplete = await this.isAllEnrichmentComplete(batchId);
        if (allComplete) {
          await storage.updateUploadBatch(batchId, {
            status: "completed",
            completedAt: new Date(),
            currentStep: "All processing complete",
            progressMessage: `Processing completed! Classification, Finexio matching, Google Address validation, and Mastercard enrichment done.`
          });
        }
        return;
      }

      // Update status to in_progress
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: "in_progress",
        akkioPredictionStartedAt: new Date(),
        akkioPredictionTotal: classificationsForPrediction.length
      });

      console.log(`Starting Akkio predictions for ${classificationsForPrediction.length} classifications`);

      // Process in batches to show progress and avoid overwhelming the API
      const batchSize = 50;
      let processedCount = 0;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < classificationsForPrediction.length; i += batchSize) {
        const batch = classificationsForPrediction.slice(i, i + batchSize);
        
        // Process each classification in the batch
        for (const classification of batch) {
          try {
            // Prepare payment data point from enriched classification
            const paymentData = {
              payee_name: classification.cleanedName,
              payee_type: classification.payeeType,
              sic_code: classification.sicCode || '',
              sic_description: classification.sicDescription || '',
              address: classification.googleFormattedAddress || classification.address || '',
              city: classification.googleCity || classification.city || '',
              state: classification.googleState || classification.state || '',
              zip: classification.googlePostalCode || classification.zipCode || '',
              country: classification.googleCountry || 'US',
              payment_method: 'ACH', // Default for now
              amount: 1000, // Default amount
              vendor_category: classification.mastercardMerchantCategoryDescription || 'Unknown',
              business_size: classification.payeeType === 'Business' ? 'medium' : 'small',
              industry_risk_score: classification.confidence < 0.8 ? 0.3 : 0.1,
              geographic_risk_score: classification.googleAddressConfidence ? (1 - classification.googleAddressConfidence) : 0.2
            };

            // Make prediction
            const prediction = await akkioService.predictPaymentOutcome(activeModel.akkioModelId, paymentData);
            
            // Update classification with prediction results
            await storage.updatePayeeClassification(classification.id, {
              akkioPredictionStatus: 'predicted',
              akkioPredictedPaymentSuccess: prediction.predicted_payment_success,
              akkioConfidenceScore: prediction.confidence_score,
              akkioRiskFactors: prediction.risk_factors,
              akkioRecommendedPaymentMethod: prediction.recommended_payment_method,
              akkioProcessingTimeEstimate: prediction.processing_time_estimate,
              akkioFraudRiskScore: prediction.fraud_risk_score,
              akkioPredictionDate: new Date(),
              akkioModelId: activeModel.akkioModelId
            });
            
            successCount++;
          } catch (error) {
            console.error(`Failed to predict for classification ${classification.id}:`, error);
            
            // Update classification with error status
            await storage.updatePayeeClassification(classification.id, {
              akkioPredictionStatus: 'error',
              akkioPredictionDate: new Date()
            });
            
            failureCount++;
          }
          
          processedCount++;
        }

        // Update progress
        const progress = Math.round((processedCount / classificationsForPrediction.length) * 100);
        await storage.updateUploadBatch(batchId, {
          akkioPredictionProgress: progress,
          akkioPredictionProcessed: processedCount
        });
        console.log(`Akkio prediction progress: ${progress}% (${processedCount}/${classificationsForPrediction.length})`);
      }

      // Mark Akkio as completed
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: "completed",
        akkioPredictionCompletedAt: new Date(),
        akkioPredictionProcessed: processedCount,
        akkioPredictionSuccessful: successCount
      });

      // Wait for all enrichment to complete
      await this.waitForEnrichmentCompletion(batchId);

      // Final check - mark batch as TRULY completed now that ALL processing is done
      const allComplete = await this.isAllEnrichmentComplete(batchId);
      if (allComplete) {
        await storage.updateUploadBatch(batchId, {
          status: "completed",
          completedAt: new Date(),
          currentStep: "All processing complete",
          progressMessage: `All processing completed! Classification, Finexio matching, Google Address validation, Mastercard enrichment, and Akkio predictions done.`
        });
      }

      console.log(`Akkio predictions completed for batch ${batchId}: ${successCount} successful, ${failureCount} failed out of ${processedCount} total`);
    } catch (error) {
      console.error('Akkio prediction process failed:', error);
      
      await storage.updateUploadBatch(batchId, {
        akkioPredictionStatus: "failed",
        akkioPredictionCompletedAt: new Date()
      });
    }
  }

  // Get the active Akkio model for payment predictions
  private async getActiveAkkioModel(): Promise<any> {
    try {
      // Get the most recent ready model
      const [activeModel] = await db
        .select()
        .from(akkioModels)
        .where(
          and(
            eq(akkioModels.status, 'ready'),
            eq(akkioModels.targetColumn, 'payment_success')
          )
        )
        .orderBy(desc(akkioModels.createdAt))
        .limit(1);
      
      return activeModel;
    } catch (error) {
      console.error('Failed to get active Akkio model:', error);
      return null;
    }
  }
}

export const optimizedClassificationService = new OptimizedClassificationService();