import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon in Node.js environment
neonConfig.webSocketConstructor = ws;

// Configure Neon for better reliability
neonConfig.pipelineConnect = false;
neonConfig.pipelineTLS = false;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// CRITICAL MEMORY MODE: Minimal database connections
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL + '?sslmode=require',
  connectionTimeoutMillis: 5000,   // 5 second timeout
  idleTimeoutMillis: 5000,         // 5 second idle timeout
  max: 1,                          // SINGLE connection only for critical memory
  maxUses: 100,                    // Aggressively recycle connections
  allowExitOnIdle: true,           // Allow graceful shutdown
  // Additional optimizations
  statement_timeout: 15000,         // 15 second statement timeout
  query_timeout: 15000              // 15 second query timeout
});

// Singleton pattern to prevent multiple pool instances
let poolInitialized = false;

// Add error handling for the pool
if (!poolInitialized) {
  pool.on('error', (err) => {
    console.error('Database pool error:', err);
  });

  // Only log the first connection
  pool.once('connect', () => {
    console.log('Database pool connected');
  });
  
  poolInitialized = true;
  console.log('Database module loaded, testing basic connection...');
}

export const db = drizzle({ client: pool, schema });