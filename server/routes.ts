import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import csv from "csv-parser";
import XLSX from "xlsx";
import { streamingProcessor } from "./services/streamingProcessor";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import healthRoutes from "./routes/health";
import batchJobRoutes from "./routes/batch-jobs";
import { AppError, errorHandler, notFoundHandler, asyncHandler } from "./middleware/errorHandler";
import { generalLimiter, uploadLimiter } from "./middleware/rateLimiter";
import { db } from "./db";
import { payeeClassifications, uploadBatches } from "@shared/schema";
import { eq } from "drizzle-orm";
import { finexioMatcherV3 } from "./services/finexioMatcherV3";
import { LRUCache } from 'lru-cache';

// Simple cache for Finexio results
declare global {
  var finexioResultsCache: LRUCache<string, {
    status: string;
    data: any;
  }>;
}

if (!global.finexioResultsCache) {
  global.finexioResultsCache = new LRUCache<string, any>({
    max: 100,
    ttl: 300000 // 5 minutes
  });
}

// Helper functions
function safeParseInt(value: string | undefined, paramName: string): number {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required parameter: ${paramName}`);
  }
  
  const parsed = parseInt(value);
  if (isNaN(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Invalid ${paramName}: must be an integer, got: ${value}`);
  }
  
  if (parsed <= 0) {
    throw new Error(`Invalid ${paramName}: must be a positive integer, got: ${value}`);
  }
  
  return parsed;
}

function safeParseIntOptional(value: string | undefined, defaultValue: number): number {
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  
  const parsed = parseInt(value);
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }
  
  return parsed;
}

function generateBatchName(): string {
  const adjectives = ["Quick", "Smart", "Fast", "Efficient", "Reliable"];
  const nouns = ["Match", "Analysis", "Processing", "Report", "Batch"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 999) + 1;
  return `${adjective} ${noun} ${number}`;
}

// File upload configuration
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

interface MulterRequest extends Request {
  file?: any;
}

// Main route registration
export async function registerRoutes(app: Express): Promise<Server> {
  // Apply security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  }));
  
  app.use(compression());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  
  // Apply rate limiting
  app.use('/api/', generalLimiter);
  
  // Health check routes
  app.use('/api', healthRoutes);
  
  // Batch job management routes
  app.use('/api/batch-jobs', batchJobRoutes);
  
  // Test database connection
  try {
    console.log("Testing database connection...");
    const result = await db.select().from(uploadBatches).limit(1);
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection failed:", error);
  }

  // =================== V1 API Routes ===================
  
  // Single Finexio match
  app.post("/api/v1/match", asyncHandler(async (req: Request, res: Response) => {
    const { payeeName, address, city, state, zip } = req.body;
    
    if (!payeeName) {
      throw new AppError("Payee name is required", 400);
    }
    
    // Check cache first
    const cacheKey = `single:${payeeName}:${address || ''}:${city || ''}:${state || ''}`;
    const cached = global.finexioResultsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    try {
      // Use Finexio matcher for single match
      const result = await finexioMatcherV3.match(
        payeeName,
        { city, state }
      );
      
      const response = {
        status: "success",
        data: {
          matched: result.matched,
          supplierId: result.supplierId,
          confidence: result.confidence,
          reasoning: result.reasoning,
          method: result.method
        }
      };
      
      // Cache the result
      global.finexioResultsCache.set(cacheKey, response);
      
      res.json(response);
    } catch (error) {
      console.error("Finexio match error:", error);
      throw new AppError("Failed to match payee", 500);
    }
  }));

  // Batch Finexio match
  app.post("/api/v1/match/batch", uploadLimiter, upload.single("file"), asyncHandler(async (req: MulterRequest, res: Response) => {
    if (!req.file) {
      throw new AppError("No file uploaded", 400);
    }
    
    const payeeColumn = req.body.payeeColumn || "payee_name";
    const userId = 1; // TODO: Get from auth
    
    // Create batch job
    const batch = await storage.createUploadBatch({
      filename: generateBatchName(),
      originalFilename: req.file.originalname,
      totalRecords: 0,
      userId,
    });
    
    // Process file in background
    processFinexioBatch(req.file, batch.id, payeeColumn);
    
    res.json({
      jobId: batch.id,
      status: "processing",
      message: "Batch processing started"
    });
  }));

  // Jobs API
  app.get("/api/v1/jobs", asyncHandler(async (req: Request, res: Response) => {
    const userId = 1; // TODO: Get from auth
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    
    const jobs = await storage.getUserUploadBatches(userId);
    const totalCount = jobs.length;
    const paginatedJobs = jobs.slice(offset, offset + limit);
    
    res.json({
      jobs: paginatedJobs.map(job => ({
        id: job.id,
        name: job.filename,
        status: job.status,
        totalRecords: job.totalRecords,
        processedRecords: job.processedRecords,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  }));

  app.get("/api/v1/jobs/:id", asyncHandler(async (req: Request, res: Response) => {
    const jobId = safeParseInt(req.params.id, "job ID");
    const job = await storage.getUploadBatch(jobId);
    
    if (!job) {
      throw new AppError("Job not found", 404);
    }
    
    // Get match results for this job
    const matches = await storage.getBatchClassifications(jobId);
    
    res.json({
      id: job.id,
      name: job.filename,
      status: job.status,
      totalRecords: job.totalRecords,
      processedRecords: job.processedRecords,
      matchedCount: job.finexioMatchedCount || 0,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      results: matches.map(m => ({
        payeeName: m.originalName,
        matched: !!m.finexioSupplierId,
        supplierName: m.finexioSupplierName,
        confidence: m.finexioConfidence
      }))
    });
  }));

  app.patch("/api/v1/jobs/:id", asyncHandler(async (req: Request, res: Response) => {
    const jobId = safeParseInt(req.params.id, "job ID");
    const { notes, labels, rerun } = req.body;
    
    const job = await storage.getUploadBatch(jobId);
    if (!job) {
      throw new AppError("Job not found", 404);
    }
    
    // Update job metadata (notes/labels would be added to schema)
    // For now, just handle rerun
    if (rerun) {
      await storage.updateUploadBatch(jobId, {
        status: "processing",
        processedRecords: 0
      });
      // Trigger reprocessing
      // processFinexioBatch would be called here
    }
    
    res.json({ success: true, jobId });
  }));

  app.delete("/api/v1/jobs/:id", asyncHandler(async (req: Request, res: Response) => {
    const jobId = safeParseInt(req.params.id, "job ID");
    
    // Delete job and related data
    await db.delete(payeeClassifications).where(eq(payeeClassifications.batchId, jobId));
    await db.delete(uploadBatches).where(eq(uploadBatches.id, jobId));
    
    res.json({ success: true, message: "Job deleted successfully" });
  }));

  app.get("/api/v1/jobs/:id/download", asyncHandler(async (req: Request, res: Response) => {
    const jobId = safeParseInt(req.params.id, "job ID");
    
    const job = await storage.getUploadBatch(jobId);
    if (!job) {
      throw new AppError("Job not found", 404);
    }
    
    const results = await storage.getBatchClassifications(jobId);
    
    // Generate CSV
    const csvContent = [
      ['Payee Name', 'Matched', 'Supplier Name', 'Confidence'],
      ...results.map(r => [
        r.originalName,
        r.finexioSupplierId ? 'Yes' : 'No',
        r.finexioSupplierName || '',
        r.finexioConfidence || ''
      ])
    ].map(row => row.join(',')).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="finexio-matches-${jobId}.csv"`);
    res.send(csvContent);
  }));

  // =================== Legacy Routes (for backward compatibility) ===================
  
  // Upload preview
  app.post("/api/upload/preview", uploadLimiter, upload.single("file"), asyncHandler(async (req: MulterRequest, res: Response) => {
    if (!req.file) {
      throw new AppError("No file uploaded", 400);
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let headers: string[] = [];
    let preview: any[] = [];

    if (ext === ".csv") {
      const rows: any[] = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on("headers", (headerList: string[]) => {
            headers = headerList;
          })
          .on("data", (data: any) => {
            if (rows.length < 5) {
              rows.push(data);
            }
          })
          .on("end", () => {
            preview = rows;
            resolve(rows);
          })
          .on("error", reject);
      });
    } else if (ext === ".xlsx" || ext === ".xls") {
      const previewResult = await streamingProcessor.getPreview(filePath, 5);
      headers = previewResult.headers;
      preview = previewResult.preview;
    }

    res.json({ 
      filename: req.file.originalname,
      headers,
      preview,
      tempFileName: req.file.filename
    });
  }));

  // Process upload
  app.post("/api/upload/process", asyncHandler(async (req: Request, res: Response) => {
    const { tempFileName, originalFilename, payeeColumn } = req.body;
    
    if (!tempFileName || !payeeColumn) {
      throw new AppError("Missing required parameters", 400);
    }

    const userId = 1; // TODO: Get from auth
    const batch = await storage.createUploadBatch({
      filename: generateBatchName(),
      originalFilename: originalFilename || "upload.csv",
      totalRecords: 0,
      userId,
    });

    const tempFilePath = `uploads/${tempFileName}`;
    processFinexioBatch(
      { path: tempFilePath, originalname: originalFilename },
      batch.id,
      payeeColumn
    );

    res.json({ 
      batchId: batch.id, 
      status: "processing",
      message: "Processing started"
    });
  }));

  // Get batches
  app.get("/api/upload/batches", asyncHandler(async (req: Request, res: Response) => {
    const userId = 1; // TODO: Get from auth
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    
    const allBatches = await storage.getUserUploadBatches(userId);
    const totalCount = allBatches.length;
    const paginatedBatches = allBatches.slice(offset, offset + limit);
    
    if (req.query.includePagination === 'true') {
      res.json({
        batches: paginatedBatches,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: offset + limit < totalCount
        }
      });
    } else {
      res.json(paginatedBatches);
    }
  }));

  // Get batch details
  app.get("/api/upload/batches/:id", asyncHandler(async (req: Request, res: Response) => {
    const batchId = safeParseInt(req.params.id, "batch ID");
    const batch = await storage.getUploadBatch(batchId);
    
    if (!batch) {
      throw new AppError("Batch not found", 404);
    }

    res.json(batch);
  }));

  // Get batch classifications
  app.get("/api/classifications/batch/:id", asyncHandler(async (req: Request, res: Response) => {
    const batchId = safeParseInt(req.params.id, "batch ID");
    const classifications = await storage.getBatchClassifications(batchId);
    res.json(classifications);
  }));

  // Dashboard stats endpoint
  app.get("/api/dashboard/stats", asyncHandler(async (req: Request, res: Response) => {
    const userId = 1; // TODO: Get from auth
    
    // Get basic stats
    const batches = await storage.getUserUploadBatches(userId);
    const totalBatches = batches.length;
    const completedBatches = batches.filter(b => b.status === 'completed').length;
    const processingBatches = batches.filter(b => b.status === 'processing').length;
    
    // Calculate total records processed
    const totalRecords = batches.reduce((sum, b) => sum + (b.totalRecords || 0), 0);
    const processedRecords = batches.reduce((sum, b) => sum + (b.processedRecords || 0), 0);
    
    // Calculate match rate
    const matchedRecords = batches.reduce((sum, b) => sum + (b.finexioMatchedCount || 0), 0);
    const matchRate = processedRecords > 0 ? (matchedRecords / processedRecords) * 100 : 0;
    
    res.json({
      totalBatches,
      completedBatches,
      processingBatches,
      totalRecords,
      processedRecords,
      matchedRecords,
      matchRate: Math.round(matchRate),
      recentBatches: batches.slice(0, 5).map(b => ({
        id: b.id,
        name: b.filename,
        status: b.status,
        totalRecords: b.totalRecords,
        processedRecords: b.processedRecords,
        createdAt: b.createdAt
      }))
    });
  }));

  // Apply error handlers
  // Don't use notFoundHandler here as it will catch frontend routes
  // app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || "5000");
  const server = createServer(app);
  
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });

  return server;
}

// Background processor for Finexio batch matching
async function processFinexioBatch(file: any, batchId: number, payeeColumn: string) {
  try {
    console.log(`Starting Finexio batch processing for batch ${batchId}`);
    
    // Update batch status
    await storage.updateUploadBatch(batchId, {
      status: "processing",
      finexioMatchingStatus: "in_progress"
    });

    const filePath = file.path;
    const ext = path.extname(file.originalname || '').toLowerCase();
    let records: any[] = [];

    // Parse file
    if (ext === ".csv") {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on("data", (data: any) => {
            records.push(data);
          })
          .on("end", resolve)
          .on("error", reject);
      });
    } else if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(sheet);
    }

    // Update total records
    await storage.updateUploadBatch(batchId, {
      totalRecords: records.length
    });

    // Process each record through Finexio matcher
    let processedCount = 0;
    let matchedCount = 0;

    for (const record of records) {
      const payeeName = record[payeeColumn];
      if (!payeeName) continue;

      try {
        // Match with Finexio
        const matchResult = await finexioMatcherV3.match(
          payeeName,
          { city: record.city, state: record.state }
        );

        // Store result
        await storage.createPayeeClassification({
          batchId,
          originalName: payeeName,
          cleanedName: payeeName,
          address: record.address,
          city: record.city,
          state: record.state,
          zipCode: record.zip || record.zipCode,
          payeeType: "Business", // Default for Finexio matches
          confidence: matchResult.confidence || 0,
          reasoning: matchResult.reasoning,
          status: "auto-classified",
          finexioSupplierId: matchResult.supplierId,
          finexioSupplierName: matchResult.matched ? payeeName : null,
          finexioConfidence: matchResult.confidence,
          finexioMatchReasoning: matchResult.reasoning,
          originalData: record
        });

        if (matchResult.matched) {
          matchedCount++;
        }
      } catch (error) {
        console.error(`Error processing record:`, error);
      }

      processedCount++;

      // Update progress every 10 records
      if (processedCount % 10 === 0) {
        await storage.updateUploadBatch(batchId, {
          processedRecords: processedCount,
          finexioMatchedCount: matchedCount,
          finexioMatchingProgress: Math.round((processedCount / records.length) * 100)
        });
      }
    }

    // Final update
    await storage.updateUploadBatch(batchId, {
      status: "completed",
      finexioMatchingStatus: "completed",
      processedRecords: processedCount,
      finexioMatchedCount: matchedCount,
      finexioMatchingProgress: 100,
      completedAt: new Date()
    });

    // Clean up temp file
    fs.unlinkSync(filePath);

    console.log(`Completed Finexio batch processing for batch ${batchId}: ${matchedCount}/${processedCount} matched`);
  } catch (error) {
    console.error(`Error in batch processing:`, error);
    await storage.updateUploadBatch(batchId, {
      status: "failed",
      finexioMatchingStatus: "failed"
    });
  }
}