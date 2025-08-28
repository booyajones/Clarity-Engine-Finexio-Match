import { db } from './server/db.js';
import { uploadBatches } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function fixStuckBatch() {
  console.log('Fixing stuck batch 157...');
  
  // Update batch 157 to completed status
  await db.update(uploadBatches)
    .set({ 
      status: 'completed',
      completedAt: new Date(),
      progressMessage: 'Processing complete!'
    })
    .where(eq(uploadBatches.id, 157));
    
  console.log('✅ Batch 157 status updated to completed');
}

fixStuckBatch().catch(console.error).finally(() => process.exit(0));
