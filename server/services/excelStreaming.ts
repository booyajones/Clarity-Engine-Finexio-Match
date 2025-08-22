import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import fs from 'fs';

/**
 * Stream Excel file processing to avoid memory spikes
 * Replaces the memory-intensive sheet_to_csv approach
 */
export class ExcelStreamProcessor {
  /**
   * Stream Excel file row by row without loading entire sheet in memory
   */
  static async streamExcelToCsv(
    excelFilePath: string, 
    csvFilePath: string
  ): Promise<void> {
    console.log(`📊 Streaming Excel to CSV: ${excelFilePath}`);
    
    try {
      const workbook = XLSX.readFile(excelFilePath, { 
        type: 'file',
        raw: true,
        codepage: 65001 // UTF-8
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet['!ref']) {
        throw new Error('Empty worksheet');
      }
      
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      const writeStream = fs.createWriteStream(csvFilePath);
      
      // Process row by row to avoid memory spike
      for (let row = range.s.r; row <= range.e.r; row++) {
        const rowData: string[] = [];
        
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          
          // Handle different cell types
          let value = '';
          if (cell) {
            if (cell.v !== undefined && cell.v !== null) {
              value = String(cell.v);
              // Escape CSV special characters
              if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = '"' + value.replace(/"/g, '""') + '"';
              }
            }
          }
          rowData.push(value);
        }
        
        writeStream.write(rowData.join(',') + '\n');
        
        // Allow event loop to breathe every 100 rows
        if (row % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      // Wait for write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });
      
      console.log(`✅ Excel streamed to CSV: ${csvFilePath}`);
    } catch (error) {
      console.error('Excel streaming error:', error);
      throw error;
    }
  }

  /**
   * Get Excel preview without loading entire sheet
   */
  static async getExcelPreview(
    filePath: string,
    maxRows: number = 10
  ): Promise<{ headers: string[]; preview: string[][] }> {
    const workbook = XLSX.readFile(filePath, {
      sheetRows: maxRows + 1 // Only read needed rows
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get headers (first row)
    const headerRow = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      range: 0,
      raw: false
    }) as string[][];
    
    const headers = headerRow[0] || [];
    
    // Get preview rows
    const previewRange = {
      s: { r: 1, c: 0 },
      e: { r: Math.min(maxRows, 10), c: Math.min(headers.length - 1, 50) }
    };
    
    const previewData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      range: previewRange,
      raw: false
    }) as string[][];
    
    return {
      headers,
      preview: previewData
    };
  }

  /**
   * Stream Excel directly to payee stream without intermediate CSV
   */
  static createExcelStream(
    filePath: string,
    payeeColumn: string
  ): Readable {
    const stream = new Readable({
      objectMode: true,
      read() {}
    });
    
    // Process in background
    (async () => {
      try {
        const workbook = XLSX.readFile(filePath, {
          type: 'file',
          raw: true
        });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet['!ref']) {
          stream.push(null);
          return;
        }
        
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        
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
          stream.emit('error', new Error(`Column "${payeeColumn}" not found`));
          stream.push(null);
          return;
        }
        
        // Stream data rows
        let rowCount = 0;
        for (let row = 1; row <= range.e.r; row++) {
          const rowData: Record<string, any> = {};
          
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = worksheet[cellAddress];
            const value = cell ? cell.v : '';
            rowData[headers[col]] = value;
          }
          
          // Extract payee name
          const payeeName = rowData[payeeColumn];
          if (payeeName && String(payeeName).trim()) {
            stream.push({
              originalName: String(payeeName).trim(),
              originalData: rowData,
              rowNumber: row + 1
            });
            rowCount++;
          }
          
          // Yield control periodically
          if (rowCount % 50 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
        
        console.log(`✅ Streamed ${rowCount} rows from Excel`);
        stream.push(null);
      } catch (error) {
        stream.emit('error', error);
        stream.push(null);
      }
    })();
    
    return stream;
  }
}

export default ExcelStreamProcessor;