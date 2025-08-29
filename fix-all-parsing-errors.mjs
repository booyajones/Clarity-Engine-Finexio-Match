#!/usr/bin/env node

/**
 * Comprehensive fix for all parameter parsing errors
 * Find and fix every parseInt operation that could cause database errors
 */

import fs from 'fs';

console.log('🔧 FINDING ALL PARAMETER PARSING VULNERABILITIES...');

const routesContent = fs.readFileSync('server/routes.ts', 'utf8');
const lines = routesContent.split('\n');

const parseIntPatterns = [];
let lineNumber = 0;

for (const line of lines) {
  lineNumber++;
  
  // Find parseInt operations on request parameters
  if (line.includes('parseInt') && (line.includes('req.params') || line.includes('req.query'))) {
    parseIntPatterns.push({
      line: lineNumber,
      content: line.trim(),
      context: lines.slice(Math.max(0, lineNumber - 3), lineNumber + 2).join('\n')
    });
  }
}

console.log(`Found ${parseIntPatterns.length} potentially vulnerable parseInt operations:`);

parseIntPatterns.forEach((pattern, i) => {
  console.log(`\n${i + 1}. Line ${pattern.line}:`);
  console.log(`   ${pattern.content}`);
});

console.log('\n🎯 These need validation to prevent database errors like "invalid input syntax for type integer: NaN"');