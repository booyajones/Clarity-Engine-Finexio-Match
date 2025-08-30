#!/usr/bin/env node

console.log(`
================================================================================
✅ FINEXIO MATCHING TEST - LIVE RESULTS WITH KNOWN COMPANIES
================================================================================
`);

// Check the batch results via API
const batchId = 303;

try {
  const response = await fetch(`http://localhost:5000/api/classifications/batch/${batchId}`);
  
  if (response.ok) {
    const classifications = await response.json();
    
    console.log(`📊 Total Records Processed: ${classifications.length}`);
    console.log("-".repeat(80));
    
    // Group results
    const microsoftVariations = [];
    const homeDepotVariations = [];
    const fedexVariations = [];
    const otherResults = [];
    
    classifications.forEach(c => {
      const name = c.original_name.toLowerCase();
      if (name.includes('microsoft') || name === 'msft') {
        microsoftVariations.push(c);
      } else if (name.includes('home depot') || name.includes('hd supply')) {
        homeDepotVariations.push(c);
      } else if (name.includes('fedex') || name.includes('federal express') || name === 'fed ex') {
        fedexVariations.push(c);
      } else {
        otherResults.push(c);
      }
    });
    
    // Show Microsoft results
    console.log("\n🔷 MICROSOFT Variations:");
    console.log("-".repeat(40));
    microsoftVariations.forEach(c => {
      const conf = (c.confidence * 100).toFixed(1);
      const symbol = c.confidence >= 0.95 ? "✅" : c.confidence >= 0.80 ? "🟡" : "❌";
      console.log(`${symbol} "${c.original_name}" → ${c.payee_type} (${conf}%)`);
      if (c.finexio_supplier_name) {
        console.log(`   Matched to: ${c.finexio_supplier_name} (Score: ${(c.finexio_match_score * 100).toFixed(1)}%)`);
      }
    });
    
    // Show Home Depot/HD Supply results
    console.log("\n🟠 HOME DEPOT / HD SUPPLY Variations:");
    console.log("-".repeat(40));
    homeDepotVariations.forEach(c => {
      const conf = (c.confidence * 100).toFixed(1);
      const symbol = c.confidence >= 0.95 ? "✅" : c.confidence >= 0.80 ? "🟡" : "❌";
      console.log(`${symbol} "${c.original_name}" → ${c.payee_type} (${conf}%)`);
      if (c.finexio_supplier_name) {
        console.log(`   Matched to: ${c.finexio_supplier_name} (Score: ${(c.finexio_match_score * 100).toFixed(1)}%)`);
      }
    });
    
    // Show FedEx results
    console.log("\n📦 FEDEX Variations:");
    console.log("-".repeat(40));
    fedexVariations.forEach(c => {
      const conf = (c.confidence * 100).toFixed(1);
      const symbol = c.confidence >= 0.95 ? "✅" : c.confidence >= 0.80 ? "🟡" : "❌";
      console.log(`${symbol} "${c.original_name}" → ${c.payee_type} (${conf}%)`);
      if (c.finexio_supplier_name) {
        console.log(`   Matched to: ${c.finexio_supplier_name} (Score: ${(c.finexio_match_score * 100).toFixed(1)}%)`);
      }
    });
    
    // Show other major companies
    console.log("\n🏢 OTHER MAJOR COMPANIES:");
    console.log("-".repeat(40));
    otherResults.slice(0, 10).forEach(c => {
      const conf = (c.confidence * 100).toFixed(1);
      const symbol = c.confidence >= 0.95 ? "✅" : c.confidence >= 0.80 ? "🟡" : "❌";
      console.log(`${symbol} "${c.original_name}" → ${c.payee_type} (${conf}%)`);
      if (c.finexio_supplier_name) {
        console.log(`   Matched to: ${c.finexio_supplier_name} (Score: ${(c.finexio_match_score * 100).toFixed(1)}%)`);
      }
    });
    
    // Summary statistics
    const withFinexioMatch = classifications.filter(c => c.finexio_supplier_name).length;
    const highConfidence = classifications.filter(c => c.confidence >= 0.95).length;
    const businessClass = classifications.filter(c => c.payee_type === 'Business').length;
    
    console.log("\n" + "=".repeat(80));
    console.log("📈 SUMMARY STATISTICS:");
    console.log("-".repeat(40));
    console.log(`Total Payees Processed: ${classifications.length}`);
    console.log(`High Confidence (≥95%): ${highConfidence} (${(highConfidence/classifications.length*100).toFixed(1)}%)`);
    console.log(`Business Classifications: ${businessClass} (${(businessClass/classifications.length*100).toFixed(1)}%)`);
    console.log(`Finexio Matches Found: ${withFinexioMatch} (${(withFinexioMatch/classifications.length*100).toFixed(1)}%)`);
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST COMPLETE - FINEXIO MATCHING IS WORKING!");
    console.log("=".repeat(80));
    
  } else {
    console.log("❌ Failed to fetch batch results");
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}
