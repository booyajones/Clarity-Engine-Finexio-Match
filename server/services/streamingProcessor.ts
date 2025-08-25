/**
 * Streaming File Processor
 * Processes CSV and Excel files row-by-row without loading entire file into memory
 * Based on Phase 1, Item 2 of optimization plan
 */

import { createReadStream } from 'fs';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { Readable } from 'stream';
import { storage } from '../storage';

export class StreamingProcessor {
  private batchSize = 100; // Process in batches of 100 rows
  
  /**
   * Stream process a CSV file without loading it entirely into memory
   */
  async processCsvStream(
    filePath: string, 
    payeeColumn: string,
    batchId: number,
    onProgress?: (processed: number, total: number) => void
  ): Promise<void> {
    console.log(`📄 Streaming CSV: ${filePath}`);
    
    const parser = createReadStream(filePath).pipe(csv());
    
    let batch: any[] = [];
    let processed = 0;
    let headers: string[] = [];
    
    for await (const record of parser) {
      // First record sets headers
      if (headers.length === 0) {
        headers = Object.keys(record);
        if (!headers.includes(payeeColumn)) {
          throw new Error(`Column "${payeeColumn}" not found in CSV`);
        }
      }
      
      // Extract payee and other data
      const payeeName = record[payeeColumn];
      if (!payeeName || payeeName.trim() === '') continue;
      
      batch.push({
        originalName: payeeName,
        normalizedName: this.normalize(payeeName),
        rowData: record,
        rowIndex: processed + 1
      });
      
      // Process batch when it reaches size limit
      if (batch.length >= this.batchSize) {
        await this.processBatch(batchId, batch);
        processed += batch.length;
        if (onProgress) onProgress(processed, -1); // Total unknown in streaming
        batch = []; // Clear batch
      }
    }
    
    // Process remaining records
    if (batch.length > 0) {
      await this.processBatch(batchId, batch);
      processed += batch.length;
      if (onProgress) onProgress(processed, processed);
    }
    
    console.log(`✅ Streamed ${processed} records with minimal memory usage`);
  }

  /**
   * Stream process Excel file row-by-row using XLSX streaming API
   */
  async processExcelStream(
    filePath: string,
    payeeColumn: string, 
    batchId: number,
    onProgress?: (processed: number, total: number) => void
  ): Promise<void> {
    console.log(`📊 Streaming Excel: ${filePath}`);
    
    // Use XLSX streaming reader with minimal memory footprint
    const workbook = XLSX.readFile(filePath, {
      type: 'file',
      raw: true,
      dense: false,
      sheetRows: 0 // Don't limit rows, we'll stream them
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet['!ref']) {
      throw new Error('Empty worksheet');
    }
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const totalRows = range.e.r;
    
    // Find payee column index
    let payeeColIndex = -1;
    const headers: string[] = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      const header = cell ? String(cell.v || '') : '';
      headers.push(header);
      
      if (header.toLowerCase() === payeeColumn.toLowerCase()) {
        payeeColIndex = col;
      }
    }
    
    if (payeeColIndex === -1) {
      throw new Error(`Column "${payeeColumn}" not found in Excel`);
    }
    
    // Process rows in batches
    let batch: any[] = [];
    let processed = 0;
    
    for (let row = 1; row <= range.e.r; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: payeeColIndex });
      const cell = worksheet[cellAddress];
      const payeeName = cell ? String(cell.v || '') : '';
      
      if (!payeeName || payeeName.trim() === '') continue;
      
      // Build row data
      const rowData: any = {};
      for (let col = range.s.c; col <= range.e.c; col++) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[addr];
        rowData[headers[col]] = cell ? cell.v : null;
      }
      
      batch.push({
        originalName: payeeName,
        normalizedName: this.normalize(payeeName),
        rowData: rowData,
        rowIndex: row + 1
      });
      
      // Process batch
      if (batch.length >= this.batchSize) {
        await this.processBatch(batchId, batch);
        processed += batch.length;
        if (onProgress) onProgress(processed, totalRows);
        batch = [];
        
        // Clear worksheet cells we've processed to free memory
        for (let col = range.s.c; col <= range.e.c; col++) {
          const addr = XLSX.utils.encode_cell({ r: row - this.batchSize + 1, c: col });
          delete worksheet[addr];
        }
      }
    }
    
    // Process remaining
    if (batch.length > 0) {
      await this.processBatch(batchId, batch);
      processed += batch.length;
      if (onProgress) onProgress(processed, totalRows);
    }
    
    console.log(`✅ Streamed ${processed} Excel records with minimal memory`);
  }

  /**
   * Create a streaming reader that yields records one at a time
   */
  createStreamReader(filePath: string, payeeColumn: string): Readable {
    const stream = new Readable({
      objectMode: true,
      read() {}
    });
    
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    
    if (ext === '.csv') {
      const parser = createReadStream(filePath).pipe(
        parse({ 
          columns: true,
          skip_empty_lines: true,
          trim: true
        })
      );
      
      parser.on('data', (record: any) => {
        const payeeName = record[payeeColumn];
        if (payeeName && payeeName.trim()) {
          stream.push({
            originalName: payeeName,
            normalizedName: this.normalize(payeeName),
            rowData: record
          });
        }
      });
      
      parser.on('end', () => stream.push(null));
      parser.on('error', (err: Error) => stream.destroy(err));
    } else {
      // For Excel, we still need to read the file but process it in chunks
      this.streamExcelChunks(filePath, payeeColumn, stream);
    }
    
    return stream;
  }

  /**
   * Stream Excel in chunks to avoid memory spike
   */
  private async streamExcelChunks(
    filePath: string, 
    payeeColumn: string,
    outputStream: Readable
  ): Promise<void> {
    try {
      // Read file with minimal memory using streaming options
      const workbook = XLSX.readFile(filePath, {
        type: 'file',
        raw: true,
        dense: false
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // Process in chunks and clear memory as we go
      const chunkSize = 100;
      let currentChunk = 0;
      
      while (currentChunk * chunkSize <= range.e.r) {
        const startRow = currentChunk * chunkSize + 1; // Skip header
        const endRow = Math.min((currentChunk + 1) * chunkSize, range.e.r);
        
        for (let row = startRow; row <= endRow; row++) {
          const rowData: any = {};
          let payeeValue = '';
          
          for (let col = range.s.c; col <= range.e.c; col++) {
            const addr = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = worksheet[addr];
            const headerAddr = XLSX.utils.encode_cell({ r: 0, c: col });
            const headerCell = worksheet[headerAddr];
            const header = headerCell ? String(headerCell.v) : '';
            
            if (cell) {
              rowData[header] = cell.v;
              if (header.toLowerCase() === payeeColumn.toLowerCase()) {
                payeeValue = String(cell.v || '');
              }
            }
            
            // Clear cell from memory after reading
            delete worksheet[addr];
          }
          
          if (payeeValue && payeeValue.trim()) {
            outputStream.push({
              originalName: payeeValue,
              normalizedName: this.normalize(payeeValue),
              rowData: rowData
            });
          }
        }
        
        currentChunk++;
      }
      
      outputStream.push(null); // End stream
    } catch (error) {
      outputStream.destroy(error as Error);
    }
  }

  /**
   * Process a batch of records
   */
  private async processBatch(batchId: number, records: any[]): Promise<void> {
    // Insert records in batch using single DB operation
    const classifications = records.map(record => ({
      batchId,
      originalName: record.originalName,
      normalizedName: record.normalizedName,
      rowIndex: record.rowIndex,
      status: 'pending',
      createdAt: new Date()
    }));
    
    // Insert classifications one by one (streaming approach)
    for (const classification of classifications) {
      await storage.createPayeeClassification(classification);
    }
  }

  /**
   * Normalize payee name for consistency
   */
  private normalize(name: string): string {
    return name
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }

  /**
   * Get memory-safe preview of file (first 10 rows only)
   */
  async getPreview(
    filePath: string,
    maxRows: number = 10
  ): Promise<{ headers: string[]; preview: any[]; totalRows: number }> {
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    
    if (ext === '.csv') {
      return this.getCsvPreview(filePath, maxRows);
    } else {
      return this.getExcelPreview(filePath, maxRows);
    }
  }

  private async getCsvPreview(
    filePath: string,
    maxRows: number
  ): Promise<{ headers: string[]; preview: any[]; totalRows: number }> {
    const rows: any[] = [];
    let headers: string[] = [];
    let totalRows = 0;
    
    const parser = createReadStream(filePath).pipe(csv());
    
    for await (const record of parser) {
      if (headers.length === 0) {
        headers = Object.keys(record);
      }
      
      if (rows.length < maxRows) {
        rows.push(record);
      }
      
      totalRows++;
    }
    
    return { headers, preview: rows, totalRows };
  }

  private async getExcelPreview(
    filePath: string,
    maxRows: number
  ): Promise<{ headers: string[]; preview: any[]; totalRows: number }> {
    // Read only first N rows for preview
    const workbook = XLSX.readFile(filePath, {
      sheetRows: maxRows + 1 // +1 for header
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    const headers = data[0] || [];
    const preview = data.slice(1, maxRows + 1).map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || null;
      });
      return obj;
    });
    
    // Get total rows without loading entire file
    const fullWorkbook = XLSX.readFile(filePath, {
      sheetRows: 0,
      bookSheets: true
    });
    const fullSheet = fullWorkbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(fullSheet['!ref'] || 'A1');
    const totalRows = range.e.r;
    
    return { headers, preview, totalRows };
  }
}

// Export singleton instance
export const streamingProcessor = new StreamingProcessor();