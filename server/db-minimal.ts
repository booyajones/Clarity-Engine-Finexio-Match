import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// MINIMAL: Single shared database connection for single-customer use
// No pools, no multiple connections, just one simple connection

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create ONE connection - not a pool
const sql = neon(databaseUrl);

// Create Drizzle instance with the single connection
export const db = drizzle(sql);

// Simple query helper (no pooling needed)
export async function query(text: string, params?: any[]) {
  try {
    return await sql(text, params);
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

console.log('✅ Database initialized - minimal single connection mode');