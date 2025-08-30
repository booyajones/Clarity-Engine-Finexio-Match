#!/usr/bin/env node

/**
 * Test Finexio matching using the EXISTING TypeScript implementation
 * This shows that the matching is already working in the current system
 */

import fetch from 'node-fetch';
import fs from 'fs';

console.log(`
================================================================================
TESTING FINEXIO MATCHING WITH EXISTING SYSTEM
================================================================================
`);

// Create a test CSV file with known companies
const testCSV = `Company Name
Microsoft Corporation
Microsoft Corp
Microsoft
Home Depot
The Home Depot
HD Supply
FedEx
Federal Express
Apple Inc
Apple Computer
Amazon
Amazon.com
Google LLC
Google
Walmart
Tesla Inc`;

fs.writeFileSync('test-known-companies.csv', testCSV);

console.log("📁 Created test file with 16 company variations");
console.log("-".repeat(60));

// Upload and process the file
console.log("\n📤 Uploading file for processing...");

const formData = new FormData();
const fileBlob = new Blob([testCSV], { type: 'text/csv' });
formData.append('file', fileBlob, 'test-known-companies.csv');
formData.append('payeeColumn', 'Company Name');
formData.append('enableFinexio', 'true');  // Enable Finexio matching
formData.append('enableMastercard', 'false');
formData.append('enableGoogleAddressValidation', 'false');
formData.append('enableAkkio', 'false');

try {
  const response = await fetch('http://localhost:5000/api/upload', {
    method: 'POST',
    body: formData
  });
  
  if (response.ok) {
    const result = await response.json();
    console.log(`✅ File uploaded successfully!`);
    console.log(`   Batch ID: ${result.id}`);
    console.log(`   Status: ${result.status}`);
    
    // Wait for processing
    console.log("\n⏳ Waiting for processing to complete...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check results
    console.log("\n📊 Checking classification results...");
    
    const batchResponse = await fetch(`http://localhost:5000/api/upload/batch/${result.id}`);
    if (batchResponse.ok) {
      const batchData = await batchResponse.json();
      
      console.log(`\nBatch Status: ${batchData.status}`);
      console.log(`Records Processed: ${batchData.totalRecords}`);
      
      // Get classifications
      const classResponse = await fetch(`http://localhost:5000/api/classifications/batch/${result.id}`);
      if (classResponse.ok) {
        const classifications = await classResponse.json();
        
        console.log(`\n🎯 Classification Results:`);
        console.log("-".repeat(60));
        
        let highConfidence = 0;
        let matched = 0;
        
        classifications.forEach(c => {
          const conf = (c.confidence * 100).toFixed(1);
          const symbol = c.confidence >= 0.95 ? "✅" : c.confidence >= 0.80 ? "🟡" : "❌";
          
          console.log(`${symbol} ${c.original_name.padEnd(25)} → ${c.classification.padEnd(12)} (${conf}%)`);
          
          if (c.finexio_match) {
            console.log(`   Matched to: ${c.finexio_match.supplier_name}`);
            matched++;
          }
          
          if (c.confidence >= 0.95) highConfidence++;
        });
        
        console.log(`\n📈 Summary:`);
        console.log(`   Total Records: ${classifications.length}`);
        console.log(`   High Confidence (≥95%): ${highConfidence}`);
        console.log(`   Finexio Matches: ${matched}`);
        console.log(`   Match Rate: ${(matched/classifications.length * 100).toFixed(1)}%`);
      }
    }
    
  } else {
    console.log(`❌ Upload failed: ${response.status}`);
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

console.log(`
================================================================================
✅ TEST COMPLETE
================================================================================
`);
