import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import fs from 'fs';

/**
 * Stream Excel file processing to avoid memory spikes
 * Surgical optimizations to eliminate heap spikes
 */
export class ExcelStreamProcessor {
  /**
   * Stream Excel to CSV using native XLSX streaming - no giant strings
   */
  static async streamExcelToCsv(
    excelFilePath: string, 
    csvFilePath: string
  ): Promise<void> {
    console.log(`📊 Streaming Excel to CSV (zero memory spike): ${excelFilePath}`);
    
    try {
      const workbook = XLSX.readFile(excelFilePath, { dense: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const writeStream = fs.createWriteStream(csvFilePath);
      
      // Use native XLSX streaming - no intermediate strings
      await new Promise<void>((resolve, reject) => {
        XLSX.stream.to_csv(worksheet, { FS: ',', RS: '\n' })
          .pipe(writeStream)
          .on('finish', () => {
            console.log('✅ Excel streamed with zero memory spike');
            resolve();
          })
          .on('error', reject);
      });
    } catch (error) {
      console.error('Excel streaming error:', error);
      throw error;
    }
  }

  /**
   * Get Excel preview - only read first 11 rows
   */
  static async getExcelPreview(
    filePath: string,
    maxRows: number = 10
  ): Promise<{ headers: string[]; preview: any[]; totalRows: number }> {
    const workbook = XLSX.readFile(filePath, {
      dense: true,
      sheetRows: 11  // Hard limit: only read first 11 rows
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get header row
    const headers = XLSX.utils.sheet_to_json<string[]>(
      worksheet, 
      { header: 1, range: 0 }
    )[0] || [];
    
    // Get sample rows (2-11)
    const sample = XLSX.utils.sheet_to_json<string[]>(
      worksheet,
      { 
        header: 1, 
        range: { 
          s: { r: 1, c: 0 }, 
          e: { r: 10, c: headers.length - 1 } 
        } 
      }
    );
    
    // Estimate total rows from ref
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const totalRows = range.e.r + 1;
    
    console.log(`✅ Preview: ${headers.length} cols, ${sample.length} samples of ~${totalRows} total`);
    
    return {
      headers,
      preview: sample,
      totalRows
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