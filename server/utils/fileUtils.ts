import fs from 'fs';
import { createReadStream } from 'fs';

/**
 * Peek at first N lines of a file without loading entire file into memory
 * Replaces dangerous readFileSync for large files
 */
export async function peekFileLines(
  filePath: string, 
  lineCount: number = 3
): Promise<string[]> {
  const readStream = createReadStream(filePath, { 
    encoding: 'utf8', 
    highWaterMark: 4096  // Read in 4KB chunks
  });
  
  let buffer = '';
  const lines: string[] = [];
  
  for await (const chunk of readStream) {
    buffer += chunk;
    const allLines = buffer.split(/\r?\n/);
    
    // Check if we have enough lines
    if (allLines.length > lineCount) {
      readStream.destroy();  // Stop reading immediately
      return allLines.slice(0, lineCount);
    }
  }
  
  // Return what we got if file is smaller than requested lines
  return buffer.split(/\r?\n/).slice(0, lineCount).filter(line => line.length > 0);
}

/**
 * Count lines in a file without loading it into memory
 */
export async function countFileLines(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    
    createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 })
      .on('data', (chunk: string) => {
        // Count newlines in chunk
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] === '\n') lineCount++;
        }
      })
      .on('end', () => resolve(lineCount))
      .on('error', reject);
  });
}

/**
 * Get file size without reading content
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.promises.stat(filePath);
  return stats.size;
}

/**
 * Get file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Check if file exists and is readable
 */
export async function isFileReadable(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete file safely
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
    console.log(`🗑️ Deleted file: ${filePath}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, that's fine
  }
}

/**
 * Create temp file path
 */
export function getTempFilePath(prefix: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `/tmp/${prefix}_${timestamp}_${random}.${extension}`;
}

/**
 * Stream copy file (for large files)
 */
export async function streamCopyFile(source: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(source);
    const writeStream = fs.createWriteStream(destination);
    
    readStream.pipe(writeStream);
    
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    readStream.on('error', reject);
  });
}

/**
 * Clean up old temp files
 */
export async function cleanupTempFiles(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  const tmpDir = '/tmp';
  const now = Date.now();
  
  try {
    const files = await fs.promises.readdir(tmpDir);
    
    for (const file of files) {
      if (file.startsWith('payee_') || file.startsWith('excel_') || file.startsWith('csv_')) {
        const filePath = `${tmpDir}/${file}`;
        const stats = await fs.promises.stat(filePath);
        
        if (now - stats.mtimeMs > olderThanMs) {
          await deleteFile(filePath);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning temp files:', error);
  }
}

export default {
  peekFileLines,
  countFileLines,
  getFileSize,
  formatFileSize,
  isFileReadable,
  deleteFile,
  getTempFilePath,
  streamCopyFile,
  cleanupTempFiles
};