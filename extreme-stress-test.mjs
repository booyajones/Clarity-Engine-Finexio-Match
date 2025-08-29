#!/usr/bin/env node

/**
 * EXTREME STRESS TESTING - FIND ALL EDGE CASES AND BUGS
 * Tests every possible failure scenario, edge case, and enhancement opportunity
 */

import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

const API_BASE = 'http://localhost:5000';
let BUGS_FOUND = [];
let ENHANCEMENTS = [];
let TEST_COUNT = 0;

// Comprehensive test scenarios
const EXTREME_TEST_SCENARIOS = [
  // Basic functionality tests
  { name: 'Tiny File', records: 1, concurrent: 1 },
  { name: 'Small Sequential', records: 5, concurrent: 1 },
  { name: 'Medium Sequential', records: 25, concurrent: 1 },
  { name: 'Large Sequential', records: 100, concurrent: 1 },
  
  // Concurrent tests
  { name: 'Low Concurrency', records: 10, concurrent: 3 },
  { name: 'Medium Concurrency', records: 15, concurrent: 5 },
  { name: 'High Concurrency', records: 20, concurrent: 8 },
  
  // Edge cases
  { name: 'Empty File', records: 0, concurrent: 1 },
  { name: 'Header Only', records: 0, concurrent: 1, headerOnly: true },
  { name: 'Single Column', records: 5, concurrent: 1, singleColumn: true },
  { name: 'Unicode Test', records: 10, concurrent: 1, unicode: true },
  { name: 'Special Characters', records: 8, concurrent: 1, specialChars: true },
  { name: 'SQL Injection Test', records: 5, concurrent: 1, sqlInjection: true },
  
  // Configuration tests
  { name: 'All Services Enabled', records: 15, concurrent: 2, allServices: true },
  { name: 'Only Classification', records: 10, concurrent: 1, onlyClassification: true },
  { name: 'Finexio Only', records: 10, concurrent: 1, finexioOnly: true },
  
  // Performance tests
  { name: 'Memory Stress', records: 500, concurrent: 1 },
  { name: 'Speed Test', records: 100, concurrent: 1, timeLimit: 30000 },
  
  // Error condition tests
  { name: 'Invalid CSV', records: 5, concurrent: 1, invalidCSV: true },
  { name: 'Malformed Data', records: 5, concurrent: 1, malformed: true },
  { name: 'Missing Headers', records: 5, concurrent: 1, noHeaders: true }
];

// Test data generators
const EVIL_PAYEE_NAMES = [
  '', // Empty
  null, // Null (will be stringified)
  'undefined',
  'DROP TABLE payee_classifications;',
  "'; DROP TABLE payee_classifications; --",
  '<script>alert("xss")</script>',
  '../../etc/passwd',
  'SELECT * FROM users WHERE id = 1',
  'Robert\'); DROP TABLE students;--',
  '🏢 Company™ ® ©', // Unicode symbols
  'Test\nNewline\rCarriageReturn\tTab',
  'Very' + 'Long'.repeat(200) + 'CompanyName', // Very long name
  'Company, Inc. & Co. LLC DBA Another Name Ltd. Corp.',
  '测试公司', // Chinese
  'тест компания', // Russian
  'テスト会社', // Japanese
  'شركة اختبار', // Arabic
  String.fromCharCode(0x00, 0x01, 0x02), // Control characters
  'Company\x00\x01\x02With\x03Nulls'
];

function generateTestCSV(config) {
  const { records, headerOnly, singleColumn, unicode, specialChars, sqlInjection, invalidCSV, malformed, noHeaders } = config;
  
  let content = '';
  
  if (invalidCSV) {
    return 'This is not CSV data at all!\nJust some random text\n123 456 789';
  }
  
  if (!noHeaders) {
    content = singleColumn ? 'Name\n' : 'Payee Name,Address,City\n';
  }
  
  if (headerOnly || records === 0) {
    return content;
  }
  
  for (let i = 0; i < records; i++) {
    let payeeName;
    
    if (unicode) {
      payeeName = `测试公司 ${i + 1}`;
    } else if (specialChars) {
      payeeName = EVIL_PAYEE_NAMES[i % EVIL_PAYEE_NAMES.length];
    } else if (sqlInjection) {
      payeeName = `Evil'; DROP TABLE payee_classifications; -- ${i}`;
    } else if (malformed) {
      payeeName = `"Unclosed Quote ${i}`;
    } else {
      payeeName = `Test Company ${i + 1}`;
    }
    
    if (singleColumn) {
      content += `"${payeeName}"\n`;
    } else {
      content += `"${payeeName}","123 Main St","Test City"\n`;
    }
  }
  
  return content;
}

async function uploadFile(filename, config = {}) {
  const { allServices, onlyClassification, finexioOnly } = config;
  
  const form = new FormData();
  form.append('file', fs.createReadStream(filename));
  form.append('payeeColumn', 'Payee Name');
  
  if (allServices) {
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'true');
    form.append('enableGoogleAddressValidation', 'true');
    form.append('enableAkkio', 'true');
  } else if (onlyClassification) {
    form.append('enableFinexio', 'false');
    form.append('enableMastercard', 'false');
    form.append('enableGoogleAddressValidation', 'false');
    form.append('enableAkkio', 'false');
  } else if (finexioOnly) {
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'false');
    form.append('enableGoogleAddressValidation', 'false');
    form.append('enableAkkio', 'false');
  } else {
    form.append('enableFinexio', 'true');
    form.append('enableMastercard', 'false');
    form.append('enableGoogleAddressValidation', 'false');
    form.append('enableAkkio', 'false');
  }

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

async function waitForBatchCompletion(batchId, maxWaitTime = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`${API_BASE}/api/upload/batches`);
    const data = await response.json();
    
    const batch = data.find(b => b.id === batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    if (batch.status === 'completed') {
      return batch;
    }
    
    if (batch.status === 'failed') {
      throw new Error(`Batch ${batchId} failed: ${batch.progressMessage}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Batch ${batchId} timeout after ${maxWaitTime}ms`);
}

async function runExtremeTest(scenario) {
  console.log(`\n🔥 EXTREME TEST ${++TEST_COUNT}: ${scenario.name} (${scenario.records} records, ${scenario.concurrent}x)`);
  
  const promises = [];
  const startTime = Date.now();
  
  for (let i = 0; i < scenario.concurrent; i++) {
    const filename = `extreme-${scenario.name.replace(/\s/g, '-')}-${i}-${Date.now()}.csv`;
    
    const promise = (async () => {
      try {
        const content = generateTestCSV(scenario);
        fs.writeFileSync(filename, content);
        
        const uploadResult = await uploadFile(filename, scenario);
        const batch = await waitForBatchCompletion(uploadResult.id, scenario.timeLimit || 60000);
        
        // Clean up
        try { fs.unlinkSync(filename); } catch (e) {}
        
        return {
          success: true,
          batchId: uploadResult.id,
          processingTime: Date.now() - startTime,
          recordsProcessed: batch.processedRecords
        };
      } catch (error) {
        BUGS_FOUND.push({
          test: scenario.name,
          type: 'Test Failure',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        try { fs.unlinkSync(filename); } catch (e) {}
        
        return {
          success: false,
          error: error.message,
          processingTime: Date.now() - startTime
        };
      }
    })();
    
    promises.push(promise);
  }
  
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.success).length;
  const failures = results.length - successes;
  
  console.log(`   ✅ Success: ${successes}/${results.length}`);
  if (failures > 0) {
    console.log(`   ❌ Failures: ${failures} - ${scenario.name} has issues`);
  }
  
  return results;
}

async function testAPIRobustness() {
  console.log('\n🔍 API ROBUSTNESS TESTING');
  
  const apiTests = [
    { path: '/api/upload/batches', method: 'GET', expectOk: true },
    { path: '/api/dashboard/stats', method: 'GET', expectOk: true },
    { path: '/api/monitoring/memory', method: 'GET', expectOk: true },
    { path: '/api/classifications/0', method: 'GET', expectOk: false }, // Invalid ID
    { path: '/api/classifications/-1', method: 'GET', expectOk: false }, // Negative ID  
    { path: '/api/classifications/abc', method: 'GET', expectOk: false }, // Non-numeric
    { path: '/api/classifications/999999', method: 'GET', expectOk: false }, // Non-existent
    { path: '/api/nonexistent', method: 'GET', expectOk: false }, // 404
    { path: '/api/upload', method: 'POST', expectOk: false }, // No file
    { path: '/api/upload', method: 'GET', expectOk: false }, // Wrong method
  ];
  
  for (const test of apiTests) {
    try {
      const response = await fetch(`${API_BASE}${test.path}`, { method: test.method });
      
      if (test.expectOk && !response.ok) {
        BUGS_FOUND.push({
          type: 'API Error',
          endpoint: test.path,
          expected: 'Success',
          got: `${response.status} ${response.statusText}`,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`   ${test.path} (${test.method}): ${response.status} ${response.ok ? '✅' : '❌'}`);
    } catch (error) {
      BUGS_FOUND.push({
        type: 'API Exception',
        endpoint: test.path,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

async function testSystemLimits() {
  console.log('\n🚀 SYSTEM LIMITS TESTING');
  
  // Memory monitoring
  const memResponse = await fetch(`${API_BASE}/api/monitoring/memory`);
  const memData = await memResponse.json();
  
  if (memData.current.heapUsedPercent > 95) {
    BUGS_FOUND.push({
      type: 'Memory Issue',
      message: `Critical memory usage: ${memData.current.heapUsedPercent}%`,
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(`   Memory Usage: ${memData.current.heapUsedPercent}% (${memData.current.heapUsed}MB)`);
  
  // Check batch count
  const batchResponse = await fetch(`${API_BASE}/api/upload/batches`);
  const batches = await batchResponse.json();
  
  console.log(`   Total Batches: ${batches.length}`);
  
  if (batches.length > 100) {
    ENHANCEMENTS.push({
      area: 'Database Management',
      suggestion: 'Implement batch archiving or cleanup for old batches',
      reason: `Database has ${batches.length} batches`
    });
  }
}

async function identifyEnhancements() {
  console.log('\n💡 ENHANCEMENT IDENTIFICATION');
  
  // Response time analysis
  const start = Date.now();
  await fetch(`${API_BASE}/api/dashboard/stats`);
  const dashboardTime = Date.now() - start;
  
  if (dashboardTime > 500) {
    ENHANCEMENTS.push({
      area: 'Performance',
      suggestion: 'Optimize dashboard API response time',
      current: `${dashboardTime}ms`,
      target: '<500ms'
    });
  }
  
  // User experience enhancements
  ENHANCEMENTS.push(
    {
      area: 'File Upload',
      suggestion: 'Add drag-and-drop file upload interface',
      impact: 'Better user experience'
    },
    {
      area: 'Progress Tracking',
      suggestion: 'Real-time progress bars with percentage completion',
      impact: 'Better user feedback'
    },
    {
      area: 'Error Handling',
      suggestion: 'User-friendly error messages with suggested fixes',
      impact: 'Reduced user confusion'
    },
    {
      area: 'Data Export',
      suggestion: 'Multiple export formats (JSON, XML, PDF reports)',
      impact: 'Better data portability'
    },
    {
      area: 'System Monitoring',
      suggestion: 'Real-time system health dashboard',
      impact: 'Better system observability'
    }
  );
  
  console.log(`   Identified ${ENHANCEMENTS.length} enhancement opportunities`);
}

async function main() {
  console.log('🎯 EXTREME STRESS TESTING - FINDING EVERY BUG AND ENHANCEMENT');
  console.log('='.repeat(80));
  
  try {
    // Run all extreme test scenarios
    for (const scenario of EXTREME_TEST_SCENARIOS) {
      await runExtremeTest(scenario);
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Additional testing
    await testAPIRobustness();
    await testSystemLimits();
    await identifyEnhancements();
    
    // Final report
    console.log('\n' + '='.repeat(80));
    console.log('🎯 EXTREME TESTING RESULTS');
    console.log('='.repeat(80));
    
    console.log(`\n📊 STATISTICS:`);
    console.log(`   Total Tests Run: ${TEST_COUNT}`);
    console.log(`   🐛 Bugs Found: ${BUGS_FOUND.length}`);
    console.log(`   💡 Enhancements Identified: ${ENHANCEMENTS.length}`);
    
    if (BUGS_FOUND.length > 0) {
      console.log(`\n🐛 CRITICAL BUGS FOUND:`);
      BUGS_FOUND.forEach((bug, i) => {
        console.log(`   ${i + 1}. ${bug.type}: ${bug.error || bug.message || bug.got}`);
      });
    }
    
    console.log(`\n💡 ENHANCEMENT OPPORTUNITIES:`);
    ENHANCEMENTS.forEach((enhancement, i) => {
      console.log(`   ${i + 1}. ${enhancement.area}: ${enhancement.suggestion}`);
    });
    
    // Save comprehensive report
    const report = {
      timestamp: new Date().toISOString(),
      testsRun: TEST_COUNT,
      bugsFound: BUGS_FOUND.length,
      enhancementsIdentified: ENHANCEMENTS.length,
      bugs: BUGS_FOUND,
      enhancements: ENHANCEMENTS
    };
    
    fs.writeFileSync('extreme-test-report.json', JSON.stringify(report, null, 2));
    console.log(`\n💾 Complete report saved to: extreme-test-report.json`);
    
    if (BUGS_FOUND.length === 0) {
      console.log(`\n🎉 ZERO CRITICAL BUGS FOUND - SYSTEM IS EXTREMELY ROBUST!`);
    } else {
      console.log(`\n⚠️  ${BUGS_FOUND.length} ISSUES REQUIRE IMMEDIATE ATTENTION`);
    }
    
  } catch (error) {
    console.error('❌ EXTREME TESTING FAILED:', error);
    process.exit(1);
  }
}

main();