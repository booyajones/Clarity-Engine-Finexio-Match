import { pgTable, text, serial, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const uploadBatches = pgTable("upload_batches", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  status: text("status").notNull().default("processing"), // processing, completed, failed
  totalRecords: integer("total_records").notNull().default(0),
  processedRecords: integer("processed_records").notNull().default(0),
  skippedRecords: integer("skipped_records").notNull().default(0),
  currentStep: text("current_step"),
  progressMessage: text("progress_message"),
  accuracy: real("accuracy").default(0),
  userId: integer("user_id").notNull(),
  // Finexio matching tracking
  finexioMatchingStatus: text("finexio_matching_status").default("pending"), // pending, in_progress, completed, failed
  finexioMatchingStartedAt: timestamp("finexio_matching_started_at"),
  finexioMatchingCompletedAt: timestamp("finexio_matching_completed_at"),
  finexioMatchPercentage: integer("finexio_match_percentage").default(0),
  finexioMatchedCount: integer("finexio_matched_count").default(0),
  finexioMatchingProcessed: integer("finexio_matching_processed").default(0),
  finexioMatchingMatched: integer("finexio_matching_matched").default(0),
  finexioMatchingProgress: integer("finexio_matching_progress").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const payeeClassifications = pgTable("payee_classifications", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  originalName: text("original_name").notNull(),
  cleanedName: text("cleaned_name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  payeeType: text("payee_type").notNull().default("Business"), // Simplified for Finexio
  confidence: real("confidence").notNull(),
  reasoning: text("reasoning"),
  status: text("status").notNull().default("auto-classified"),
  reviewedBy: integer("reviewed_by"),
  originalData: jsonb("original_data"),
  // Finexio matching fields
  finexioSupplierId: text("finexio_supplier_id"),
  finexioSupplierName: text("finexio_supplier_name"),
  finexioConfidence: real("finexio_confidence"),
  finexioMatchReasoning: text("finexio_match_reasoning"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cached Finexio suppliers for faster matching
export const cachedSuppliers = pgTable("cached_suppliers", {
  id: serial("id").primaryKey(),
  payeeId: text("payee_id").notNull().unique(),
  payeeName: text("payee_name").notNull(),
  normalizedName: text("normalized_name"),
  category: text("category"),
  mcc: text("mcc"),
  industry: text("industry"),
  paymentType: text("payment_type"),
  city: text("city"),
  state: text("state"),
  confidence: real("confidence"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

// Finexio matching results
export const payeeMatches = pgTable("payee_matches", {
  id: serial("id").primaryKey(),
  classificationId: integer("classification_id").notNull(),
  finexioPayeeId: text("finexio_payee_id").notNull(),
  finexioPayeeName: text("finexio_payee_name").notNull(),
  matchConfidence: real("match_confidence").notNull(),
  finexioMatchScore: real("finexio_match_score"),
  matchType: text("match_type").notNull(), // exact, early_accept, llm, no_match
  matchReasoning: text("match_reasoning"),
  matchDetails: jsonb("match_details"),
  isConfirmed: boolean("is_confirmed").default(false),
  confirmedBy: integer("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type SelectUser = typeof users.$inferSelect;

export const insertUploadBatchSchema = createInsertSchema(uploadBatches).omit({ 
  id: true, 
  createdAt: true, 
  completedAt: true 
});
export type InsertUploadBatch = z.infer<typeof insertUploadBatchSchema>;
export type SelectUploadBatch = typeof uploadBatches.$inferSelect;

export const insertPayeeClassificationSchema = createInsertSchema(payeeClassifications).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertPayeeClassification = z.infer<typeof insertPayeeClassificationSchema>;
export type SelectPayeeClassification = typeof payeeClassifications.$inferSelect;

export const insertCachedSupplierSchema = createInsertSchema(cachedSuppliers).omit({ 
  id: true, 
  lastUpdated: true 
});
export type InsertCachedSupplier = z.infer<typeof insertCachedSupplierSchema>;
export type SelectCachedSupplier = typeof cachedSuppliers.$inferSelect;

export const insertPayeeMatchSchema = createInsertSchema(payeeMatches).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertPayeeMatch = z.infer<typeof insertPayeeMatchSchema>;
export type SelectPayeeMatch = typeof payeeMatches.$inferSelect;