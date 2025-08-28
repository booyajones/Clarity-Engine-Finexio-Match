import { finexioModule } from './server/services/modules/finexioModule.js';

async function triggerFinexioMatching() {
  const batchId = 165;
  
  try {
    console.log(`Starting Finexio matching for batch ${batchId}...`);
    
    // Execute the Finexio module directly
    await finexioModule.execute(batchId, {});
    
    console.log('Finexio matching completed successfully!');
  } catch (error) {
    console.error('Error during Finexio matching:', error);
  }
  
  process.exit(0);
}

triggerFinexioMatching();