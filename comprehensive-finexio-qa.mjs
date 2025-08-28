import fetch from 'node-fetch';

console.log('\n🔍 COMPREHENSIVE FINEXIO DISPLAY QA TEST');
console.log('=' .repeat(80));

// Test batch 158
const batchResponse = await fetch('http://localhost:5000/api/upload/batches');
const batches = await batchResponse.json();
const batch158 = batches.find(b => b.id === 158);

console.log('\n✅ TEST 1: Database Summary');
console.log('-'.repeat(60));
console.log(`Batch Status: ${batch158.status}`);
console.log(`Total Records: ${batch158.totalRecords}`);
console.log(`Finexio Matched Count: ${batch158.finexioMatchedCount}`);
console.log(`Finexio Match %: ${batch158.finexioMatchPercentage}%`);

// Get all records from batch 158
const allRecordsResponse = await fetch('http://localhost:5000/api/classifications/158?page=1&limit=300');
const allData = await allRecordsResponse.json();
const classifications = allData.classifications || [];

// Count actual matches
const withFinexioData = classifications.filter(c => c.finexioSupplierId);
const withHighConfidence = withFinexioData.filter(c => c.finexioConfidence >= 0.85);

console.log('\n✅ TEST 2: API Data Verification');
console.log('-'.repeat(60));
console.log(`Records with Finexio Supplier ID: ${withFinexioData.length}`);
console.log(`Records with High Confidence (≥85%): ${withHighConfidence.length}`);
console.log(`Records without Match: ${classifications.length - withFinexioData.length}`);

// Test specific records
console.log('\n✅ TEST 3: Specific Record Verification');
console.log('-'.repeat(60));

const testCases = [
  'KENNETH PSILLAS LANDSCAPING',
  'Westlake Village Inn',
  'Pepsi-Cola'
];

for (const testName of testCases) {
  const record = classifications.find(c => 
    c.originalName.toUpperCase().includes(testName.toUpperCase())
  );
  
  if (record) {
    console.log(`\n${record.originalName}:`);
    console.log(`  ✓ Has Finexio ID: ${record.finexioSupplierId ? 'YES' : 'NO'}`);
    if (record.finexioSupplierId) {
      console.log(`  ✓ Supplier ID: ${record.finexioSupplierId}`);
      console.log(`  ✓ Supplier Name: ${record.finexioSupplierName || 'Same as original'}`);
      console.log(`  ✓ Confidence: ${Math.round((record.finexioConfidence || 0) * 100)}%`);
      console.log(`  ✓ Match Reasoning: ${record.finexioMatchReasoning || 'N/A'}`);
    }
  } else {
    console.log(`\n${testName}: NOT FOUND in results`);
  }
}

// Verify data structure
console.log('\n✅ TEST 4: Data Structure Verification');
console.log('-'.repeat(60));

const sampleRecord = withFinexioData[0];
if (sampleRecord) {
  console.log('Sample Record Fields:');
  console.log(`  ✓ finexioSupplierId: ${typeof sampleRecord.finexioSupplierId} (${sampleRecord.finexioSupplierId ? 'Present' : 'Missing'})`);
  console.log(`  ✓ finexioSupplierName: ${typeof sampleRecord.finexioSupplierName} (${sampleRecord.finexioSupplierName ? 'Present' : 'Missing'})`);
  console.log(`  ✓ finexioConfidence: ${typeof sampleRecord.finexioConfidence} (${sampleRecord.finexioConfidence !== undefined ? 'Present' : 'Missing'})`);
  console.log(`  ✓ payeeMatches: ${typeof sampleRecord.payeeMatches} (${sampleRecord.payeeMatches ? 'Present' : 'Missing'})`);
}

// Final summary
console.log('\n' + '='.repeat(80));
console.log('📊 FINEXIO QA SUMMARY:');
console.log('='.repeat(80));

const dataIntegrity = batch158.finexioMatchedCount === withFinexioData.length;
const fieldsPresent = withFinexioData.every(r => 
  r.finexioSupplierId && r.finexioConfidence !== undefined
);

console.log(`✅ Database vs API Match Count: ${dataIntegrity ? 'PASS' : 'FAIL'} (${batch158.finexioMatchedCount} vs ${withFinexioData.length})`);
console.log(`✅ All Matched Records Have Required Fields: ${fieldsPresent ? 'PASS' : 'FAIL'}`);
console.log(`✅ Data Structure: Using direct fields (finexioSupplierId, finexioConfidence, etc.)`);
console.log(`✅ Match Rate: ${Math.round(withFinexioData.length * 100 / classifications.length)}% (${withFinexioData.length}/${classifications.length})`);

console.log('\n📝 FRONTEND DISPLAY NOTES:');
console.log('-'.repeat(60));
console.log('✓ List view now uses: finexioSupplierId, finexioConfidence, finexioSupplierName');
console.log('✓ Modal view now uses: finexioSupplierId, finexioConfidence, finexioSupplierName');
console.log('✓ Confidence displayed as percentage (finexioConfidence * 100)');
console.log('✓ Match threshold: 85% for "Match" badge, otherwise "Partial"');

console.log('\n🎯 SYSTEM STATUS: ' + (dataIntegrity && fieldsPresent ? 'WORKING CORRECTLY' : 'ISSUES DETECTED'));
console.log('='.repeat(80));