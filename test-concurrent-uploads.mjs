#!/usr/bin/env node

/**
 * Quick test to verify rate limiting fix
 */

import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

const API_BASE = 'http://localhost:5000';

function generateTestCSV(recordCount) {
  let content = 'Payee Name\n';
  for (let i = 0; i < recordCount; i++) {
    content += `Test Company ${i + 1}\n`;
  }
  return content;
}

async function uploadFile(filename) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filename));
  form.append('payeeColumn', 'Payee Name');
  form.append('enableFinexio', 'true');
  form.append('enableMastercard', 'false');

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: form
  });

  return { status: response.status, ok: response.ok };
}

async function testConcurrentUploads() {
  console.log('🔬 Testing concurrent uploads after rate limiting fix...');
  
  const promises = [];
  for (let i = 0; i < 5; i++) {
    const filename = `quick-test-${i}-${Date.now()}.csv`;
    const content = generateTestCSV(3);
    fs.writeFileSync(filename, content);
    
    promises.push(
      uploadFile(filename).then(result => {
        try { fs.unlinkSync(filename); } catch (e) {}
        return result;
      })
    );
  }
  
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok).length;
  
  console.log(`✅ Succeeded: ${successes}/5`);
  console.log(`❌ Failed: ${failures}/5`);
  
  if (failures > 0) {
    console.log('❌ Rate limiting issue still exists');
    results.forEach((r, i) => {
      if (!r.ok) {
        console.log(`   Upload ${i + 1}: ${r.status}`);
      }
    });
  } else {
    console.log('🎉 Rate limiting fixed - concurrent uploads working!');
  }
}

testConcurrentUploads();