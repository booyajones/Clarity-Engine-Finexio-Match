#!/usr/bin/env node

/**
 * ENABLE GARBAGE COLLECTION FOR MEMORY OPTIMIZATION
 * Modify package.json and server startup to enable --expose-gc
 */

import fs from 'fs';

console.log('🧠 ENABLING GARBAGE COLLECTION FOR MEMORY OPTIMIZATION...');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Modify dev script to include --expose-gc
if (packageJson.scripts && packageJson.scripts.dev) {
  const currentDev = packageJson.scripts.dev;
  
  if (!currentDev.includes('--expose-gc')) {
    packageJson.scripts.dev = currentDev.replace(
      'NODE_ENV=development tsx', 
      'NODE_ENV=development node --expose-gc ./node_modules/.bin/tsx'
    );
    
    console.log('✅ Updated dev script to enable garbage collection');
    console.log(`   Before: ${currentDev}`);
    console.log(`   After:  ${packageJson.scripts.dev}`);
  } else {
    console.log('✅ Garbage collection already enabled in dev script');
  }
}

// Write back to package.json
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

// Also update server index.ts to trigger GC more aggressively
let indexContent = fs.readFileSync('server/index.ts', 'utf8');

// Add aggressive memory management if not already present
if (!indexContent.includes('Manual garbage collection for memory optimization')) {
  const gcOptimization = `
    // Manual garbage collection for memory optimization - PRODUCTION CRITICAL
    if (global.gc) {
      setInterval(() => {
        try {
          const beforeGC = process.memoryUsage();
          global.gc();
          const afterGC = process.memoryUsage();
          const freed = beforeGC.heapUsed - afterGC.heapUsed;
          if (freed > 5 * 1024 * 1024) { // Only log if we freed > 5MB
            console.log(\`🧹 GC freed \${Math.round(freed / 1024 / 1024)}MB (heap: \${Math.round(afterGC.heapUsed / 1024 / 1024)}MB)\`);
          }
        } catch (error) {
          console.log('⚠️ GC error:', error.message);
        }
      }, 10000); // Every 10 seconds
      console.log('🧠 Aggressive garbage collection enabled (10s interval)');
    } else {
      console.log('⚠️ Garbage collection not available - restart with --expose-gc');
    }
`;
  
  // Insert after the memory monitoring setup
  indexContent = indexContent.replace(
    '// Aggressive memory management - GC every 15 seconds and clear caches',
    `// Manual garbage collection for memory optimization - PRODUCTION CRITICAL${gcOptimization}
    
    // Aggressive memory management - GC every 15 seconds and clear caches`
  );
  
  fs.writeFileSync('server/index.ts', indexContent);
  console.log('✅ Enhanced server memory management with aggressive GC');
}

console.log('🎉 MEMORY OPTIMIZATION SETUP COMPLETE');
console.log('🔄 Restart required to take effect with: npm run dev');