import { 
  users, 
  uploadBatches, 
  payeeClassifications, 
  payeeMatches,
  cachedSuppliers,
  type SelectUser as User, 
  type InsertUser,
  type SelectUploadBatch as UploadBatch,
  type InsertUploadBatch,
  type SelectPayeeClassification as PayeeClassification,
  type InsertPayeeClassification,
  type SelectPayeeMatch as PayeeMatch,
  type InsertPayeeMatch,
  type SelectCachedSupplier as CachedSupplier,
  type InsertCachedSupplier
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Upload batch operations
  createUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch>;
  getUploadBatch(id: number): Promise<UploadBatch | undefined>;
  updateUploadBatch(id: number, updates: Partial<UploadBatch>): Promise<UploadBatch>;
  getUserUploadBatches(userId: number): Promise<UploadBatch[]>;

  // Payee classification operations
  createPayeeClassification(classification: InsertPayeeClassification): Promise<PayeeClassification>;
  createPayeeClassifications(classifications: InsertPayeeClassification[]): Promise<PayeeClassification[]>;
  getPayeeClassification(id: number): Promise<PayeeClassification | undefined>;
  updatePayeeClassification(id: number, updates: Partial<PayeeClassification>): Promise<PayeeClassification>;
  getBatchClassifications(batchId: number, limit?: number, offset?: number): Promise<PayeeClassification[]>;
  getBatchClassificationCount(batchId: number): Promise<number>;
  getPendingReviewClassifications(limit?: number): Promise<PayeeClassification[]>;
  getClassificationStats(): Promise<{
    totalPayees: number;
    accuracy: number;
    pendingReview: number;
    filesProcessed: number;
  }>;

  // Batch summary
  getBatchSummary(batchId: number): Promise<{
    total: number;
    matched: number;
    unmatched: number;
  }>;

  // Delete operations
  deleteUploadBatch(id: number): Promise<void>;
  deleteBatchClassifications(batchId: number): Promise<void>;
  
  // Payee matching operations
  createPayeeMatch(match: InsertPayeeMatch): Promise<PayeeMatch>;
  getPayeeMatch(id: number): Promise<PayeeMatch | undefined>;
  updatePayeeMatch(id: number, updates: Partial<PayeeMatch>): Promise<PayeeMatch>;
  getClassificationMatches(classificationId: number): Promise<PayeeMatch[]>;
  getBatchMatches(batchId: number): Promise<PayeeMatch[]>;
  getPayeeClassificationsByBatch(batchId: number): Promise<PayeeClassification[]>;
  
  // Finexio/cached supplier operations
  checkFinexioSupplier(name: string): Promise<{id: string; name: string; confidence: number} | null>;
  updateClassificationFinexioMatch(classificationId: number, finexioData: {
    finexioSupplierId: string;
    finexioSupplierName: string;
    finexioConfidence: number;
  }): Promise<void>;
  getCachedSuppliers(): Promise<CachedSupplier[]>;
  upsertCachedSupplier(supplier: InsertCachedSupplier): Promise<CachedSupplier>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async createUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch> {
    const [newBatch] = await db.insert(uploadBatches).values(batch).returning();
    return newBatch;
  }

  async getUploadBatch(id: number): Promise<UploadBatch | undefined> {
    const [batch] = await db.select().from(uploadBatches).where(eq(uploadBatches.id, id));
    return batch || undefined;
  }

  async updateUploadBatch(id: number, updates: Partial<UploadBatch>): Promise<UploadBatch> {
    const [updatedBatch] = await db.update(uploadBatches)
      .set(updates)
      .where(eq(uploadBatches.id, id))
      .returning();
    return updatedBatch;
  }

  async getUserUploadBatches(userId: number): Promise<UploadBatch[]> {
    return await db.select()
      .from(uploadBatches)
      .where(eq(uploadBatches.userId, userId))
      .orderBy(desc(uploadBatches.createdAt));
  }

  async createPayeeClassification(classification: InsertPayeeClassification): Promise<PayeeClassification> {
    const [newClassification] = await db.insert(payeeClassifications).values(classification).returning();
    return newClassification;
  }

  async createPayeeClassifications(classifications: InsertPayeeClassification[]): Promise<PayeeClassification[]> {
    if (classifications.length === 0) return [];
    return await db.insert(payeeClassifications).values(classifications).returning();
  }

  async getPayeeClassification(id: number): Promise<PayeeClassification | undefined> {
    const [classification] = await db.select().from(payeeClassifications).where(eq(payeeClassifications.id, id));
    return classification || undefined;
  }

  async updatePayeeClassification(id: number, updates: Partial<PayeeClassification>): Promise<PayeeClassification> {
    const [updatedClassification] = await db.update(payeeClassifications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payeeClassifications.id, id))
      .returning();
    return updatedClassification;
  }

  async getBatchClassifications(batchId: number, limit?: number, offset?: number): Promise<PayeeClassification[]> {
    let query = db.select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId))
      .orderBy(desc(payeeClassifications.createdAt));
    
    if (limit) query = query.limit(limit);
    if (offset) query = query.offset(offset);
    
    return await query;
  }

  async getBatchClassificationCount(batchId: number): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId));
    return result?.count || 0;
  }

  async getPendingReviewClassifications(limit: number = 50): Promise<PayeeClassification[]> {
    return await db.select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.status, 'pending-review'))
      .orderBy(desc(payeeClassifications.createdAt))
      .limit(limit);
  }

  async getClassificationStats(): Promise<{
    totalPayees: number;
    accuracy: number;
    pendingReview: number;
    filesProcessed: number;
  }> {
    const [totalResult] = await db.select({ count: count() }).from(payeeClassifications);
    const [pendingResult] = await db.select({ count: count() })
      .from(payeeClassifications)
      .where(eq(payeeClassifications.status, 'pending-review'));
    const [filesResult] = await db.select({ count: count() }).from(uploadBatches);
    const [matchedResult] = await db.select({ count: count() })
      .from(payeeClassifications)
      .where(sql`${payeeClassifications.finexioSupplierId} IS NOT NULL`);

    const total = totalResult?.count || 0;
    const matched = matchedResult?.count || 0;
    const accuracy = total > 0 ? (matched / total) * 100 : 0;

    return {
      totalPayees: total,
      accuracy: Math.round(accuracy),
      pendingReview: pendingResult?.count || 0,
      filesProcessed: filesResult?.count || 0,
    };
  }

  async getBatchSummary(batchId: number): Promise<{
    total: number;
    matched: number;
    unmatched: number;
  }> {
    const classifications = await this.getBatchClassifications(batchId);
    const matched = classifications.filter(c => c.finexioSupplierId).length;
    
    return {
      total: classifications.length,
      matched,
      unmatched: classifications.length - matched
    };
  }

  async deleteUploadBatch(id: number): Promise<void> {
    await db.delete(uploadBatches).where(eq(uploadBatches.id, id));
  }

  async deleteBatchClassifications(batchId: number): Promise<void> {
    await db.delete(payeeClassifications).where(eq(payeeClassifications.batchId, batchId));
  }

  async createPayeeMatch(match: InsertPayeeMatch): Promise<PayeeMatch> {
    const [newMatch] = await db.insert(payeeMatches).values(match).returning();
    return newMatch;
  }

  async getPayeeMatch(id: number): Promise<PayeeMatch | undefined> {
    const [match] = await db.select().from(payeeMatches).where(eq(payeeMatches.id, id));
    return match || undefined;
  }

  async updatePayeeMatch(id: number, updates: Partial<PayeeMatch>): Promise<PayeeMatch> {
    const [updatedMatch] = await db.update(payeeMatches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payeeMatches.id, id))
      .returning();
    return updatedMatch;
  }

  async getClassificationMatches(classificationId: number): Promise<PayeeMatch[]> {
    return await db.select()
      .from(payeeMatches)
      .where(eq(payeeMatches.classificationId, classificationId))
      .orderBy(desc(payeeMatches.matchConfidence));
  }

  async getBatchMatches(batchId: number): Promise<PayeeMatch[]> {
    const classifications = await this.getBatchClassifications(batchId);
    const classificationIds = classifications.map(c => c.id);
    if (classificationIds.length === 0) return [];
    
    return await db.select()
      .from(payeeMatches)
      .where(sql`${payeeMatches.classificationId} = ANY(${classificationIds})`);
  }

  async getPayeeClassificationsByBatch(batchId: number): Promise<PayeeClassification[]> {
    return await db.select()
      .from(payeeClassifications)
      .where(eq(payeeClassifications.batchId, batchId));
  }

  async checkFinexioSupplier(name: string): Promise<{id: string; name: string; confidence: number} | null> {
    // Check cached suppliers for a match
    const normalizedName = name.toLowerCase().trim();
    const [supplier] = await db.select()
      .from(cachedSuppliers)
      .where(sql`LOWER(${cachedSuppliers.payeeName}) = ${normalizedName}`)
      .limit(1);
    
    if (supplier) {
      return {
        id: supplier.payeeId,
        name: supplier.payeeName,
        confidence: supplier.confidence || 0.8
      };
    }
    
    return null;
  }

  async updateClassificationFinexioMatch(classificationId: number, finexioData: {
    finexioSupplierId: string;
    finexioSupplierName: string;
    finexioConfidence: number;
  }): Promise<void> {
    await db.update(payeeClassifications)
      .set({
        finexioSupplierId: finexioData.finexioSupplierId,
        finexioSupplierName: finexioData.finexioSupplierName,
        finexioConfidence: finexioData.finexioConfidence,
        updatedAt: new Date()
      })
      .where(eq(payeeClassifications.id, classificationId));
  }

  async getCachedSuppliers(): Promise<CachedSupplier[]> {
    return await db.select().from(cachedSuppliers);
  }

  async upsertCachedSupplier(supplier: InsertCachedSupplier): Promise<CachedSupplier> {
    const existing = await db.select()
      .from(cachedSuppliers)
      .where(eq(cachedSuppliers.payeeId, supplier.payeeId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(cachedSuppliers)
        .set({ ...supplier, lastUpdated: new Date() })
        .where(eq(cachedSuppliers.payeeId, supplier.payeeId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(cachedSuppliers)
        .values(supplier)
        .returning();
      return created;
    }
  }
}

// Memory storage implementation for development/testing
export class MemStorage implements IStorage {
  private users: User[] = [];
  private uploadBatches: UploadBatch[] = [];
  private payeeClassifications: PayeeClassification[] = [];
  private payeeMatches: PayeeMatch[] = [];
  private cachedSuppliers: CachedSupplier[] = [];
  private nextId = 1;

  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      ...user,
      id: this.nextId++,
      createdAt: new Date()
    };
    this.users.push(newUser);
    return newUser;
  }

  async createUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch> {
    const newBatch: UploadBatch = {
      ...batch,
      id: this.nextId++,
      status: batch.status || 'processing',
      totalRecords: batch.totalRecords || 0,
      processedRecords: batch.processedRecords || 0,
      skippedRecords: batch.skippedRecords || 0,
      currentStep: batch.currentStep || null,
      progressMessage: batch.progressMessage || null,
      accuracy: batch.accuracy || 0,
      finexioMatchingStatus: batch.finexioMatchingStatus || 'pending',
      finexioMatchingStartedAt: batch.finexioMatchingStartedAt || null,
      finexioMatchingCompletedAt: batch.finexioMatchingCompletedAt || null,
      finexioMatchPercentage: batch.finexioMatchPercentage || 0,
      finexioMatchedCount: batch.finexioMatchedCount || 0,
      finexioMatchingProcessed: batch.finexioMatchingProcessed || 0,
      finexioMatchingMatched: batch.finexioMatchingMatched || 0,
      finexioMatchingProgress: batch.finexioMatchingProgress || 0,
      createdAt: new Date(),
      completedAt: batch.completedAt || null
    };
    this.uploadBatches.push(newBatch);
    return newBatch;
  }

  async getUploadBatch(id: number): Promise<UploadBatch | undefined> {
    return this.uploadBatches.find(b => b.id === id);
  }

  async updateUploadBatch(id: number, updates: Partial<UploadBatch>): Promise<UploadBatch> {
    const batch = this.uploadBatches.find(b => b.id === id);
    if (!batch) throw new Error('Batch not found');
    Object.assign(batch, updates);
    return batch;
  }

  async getUserUploadBatches(userId: number): Promise<UploadBatch[]> {
    return this.uploadBatches
      .filter(b => b.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createPayeeClassification(classification: InsertPayeeClassification): Promise<PayeeClassification> {
    const newClassification: PayeeClassification = {
      ...classification,
      id: this.nextId++,
      payeeType: classification.payeeType || 'Business',
      status: classification.status || 'auto-classified',
      reviewedBy: classification.reviewedBy || null,
      originalData: classification.originalData || null,
      finexioSupplierId: classification.finexioSupplierId || null,
      finexioSupplierName: classification.finexioSupplierName || null,
      finexioConfidence: classification.finexioConfidence || null,
      finexioMatchReasoning: classification.finexioMatchReasoning || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.payeeClassifications.push(newClassification);
    return newClassification;
  }

  async createPayeeClassifications(classifications: InsertPayeeClassification[]): Promise<PayeeClassification[]> {
    const created: PayeeClassification[] = [];
    for (const c of classifications) {
      created.push(await this.createPayeeClassification(c));
    }
    return created;
  }

  async getPayeeClassification(id: number): Promise<PayeeClassification | undefined> {
    return this.payeeClassifications.find(c => c.id === id);
  }

  async updatePayeeClassification(id: number, updates: Partial<PayeeClassification>): Promise<PayeeClassification> {
    const classification = this.payeeClassifications.find(c => c.id === id);
    if (!classification) throw new Error('Classification not found');
    Object.assign(classification, { ...updates, updatedAt: new Date() });
    return classification;
  }

  async getBatchClassifications(batchId: number, limit?: number, offset?: number): Promise<PayeeClassification[]> {
    let classifications = this.payeeClassifications.filter(c => c.batchId === batchId);
    if (offset) classifications = classifications.slice(offset);
    if (limit) classifications = classifications.slice(0, limit);
    return classifications;
  }

  async getBatchClassificationCount(batchId: number): Promise<number> {
    return this.payeeClassifications.filter(c => c.batchId === batchId).length;
  }

  async getPendingReviewClassifications(limit: number = 50): Promise<PayeeClassification[]> {
    return this.payeeClassifications
      .filter(c => c.status === 'pending-review')
      .slice(0, limit);
  }

  async getClassificationStats(): Promise<{
    totalPayees: number;
    accuracy: number;
    pendingReview: number;
    filesProcessed: number;
  }> {
    const total = this.payeeClassifications.length;
    const matched = this.payeeClassifications.filter(c => c.finexioSupplierId).length;
    const accuracy = total > 0 ? (matched / total) * 100 : 0;
    const pendingReview = this.payeeClassifications.filter(c => c.status === 'pending-review').length;
    const filesProcessed = this.uploadBatches.length;

    return {
      totalPayees: total,
      accuracy: Math.round(accuracy),
      pendingReview,
      filesProcessed
    };
  }

  async getBatchSummary(batchId: number): Promise<{
    total: number;
    matched: number;
    unmatched: number;
  }> {
    const classifications = this.payeeClassifications.filter(c => c.batchId === batchId);
    const matched = classifications.filter(c => c.finexioSupplierId).length;
    
    return {
      total: classifications.length,
      matched,
      unmatched: classifications.length - matched
    };
  }

  async deleteUploadBatch(id: number): Promise<void> {
    const index = this.uploadBatches.findIndex(b => b.id === id);
    if (index !== -1) this.uploadBatches.splice(index, 1);
  }

  async deleteBatchClassifications(batchId: number): Promise<void> {
    this.payeeClassifications = this.payeeClassifications.filter(c => c.batchId !== batchId);
  }

  async createPayeeMatch(match: InsertPayeeMatch): Promise<PayeeMatch> {
    const newMatch: PayeeMatch = {
      ...match,
      id: this.nextId++,
      isConfirmed: match.isConfirmed || false,
      confirmedBy: match.confirmedBy || null,
      confirmedAt: match.confirmedAt || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.payeeMatches.push(newMatch);
    return newMatch;
  }

  async getPayeeMatch(id: number): Promise<PayeeMatch | undefined> {
    return this.payeeMatches.find(m => m.id === id);
  }

  async updatePayeeMatch(id: number, updates: Partial<PayeeMatch>): Promise<PayeeMatch> {
    const match = this.payeeMatches.find(m => m.id === id);
    if (!match) throw new Error('Match not found');
    Object.assign(match, { ...updates, updatedAt: new Date() });
    return match;
  }

  async getClassificationMatches(classificationId: number): Promise<PayeeMatch[]> {
    return this.payeeMatches.filter(m => m.classificationId === classificationId);
  }

  async getBatchMatches(batchId: number): Promise<PayeeMatch[]> {
    const classificationIds = this.payeeClassifications
      .filter(c => c.batchId === batchId)
      .map(c => c.id);
    return this.payeeMatches.filter(m => classificationIds.includes(m.classificationId));
  }

  async getPayeeClassificationsByBatch(batchId: number): Promise<PayeeClassification[]> {
    return this.payeeClassifications.filter(c => c.batchId === batchId);
  }

  async checkFinexioSupplier(name: string): Promise<{id: string; name: string; confidence: number} | null> {
    const normalizedName = name.toLowerCase().trim();
    const supplier = this.cachedSuppliers.find(s => 
      s.payeeName.toLowerCase().trim() === normalizedName
    );
    
    if (supplier) {
      return {
        id: supplier.payeeId,
        name: supplier.payeeName,
        confidence: supplier.confidence || 0.8
      };
    }
    
    return null;
  }

  async updateClassificationFinexioMatch(classificationId: number, finexioData: {
    finexioSupplierId: string;
    finexioSupplierName: string;
    finexioConfidence: number;
  }): Promise<void> {
    const classification = this.payeeClassifications.find(c => c.id === classificationId);
    if (classification) {
      classification.finexioSupplierId = finexioData.finexioSupplierId;
      classification.finexioSupplierName = finexioData.finexioSupplierName;
      classification.finexioConfidence = finexioData.finexioConfidence;
      classification.updatedAt = new Date();
    }
  }

  async getCachedSuppliers(): Promise<CachedSupplier[]> {
    return this.cachedSuppliers;
  }

  async upsertCachedSupplier(supplier: InsertCachedSupplier): Promise<CachedSupplier> {
    const existing = this.cachedSuppliers.find(s => s.payeeId === supplier.payeeId);
    
    if (existing) {
      Object.assign(existing, { ...supplier, lastUpdated: new Date() });
      return existing;
    } else {
      const newSupplier: CachedSupplier = {
        ...supplier,
        id: this.nextId++,
        normalizedName: supplier.normalizedName || null,
        category: supplier.category || null,
        mcc: supplier.mcc || null,
        industry: supplier.industry || null,
        paymentType: supplier.paymentType || null,
        city: supplier.city || null,
        state: supplier.state || null,
        confidence: supplier.confidence || null,
        metadata: supplier.metadata || null,
        lastUpdated: new Date()
      };
      this.cachedSuppliers.push(newSupplier);
      return newSupplier;
    }
  }
}

// Export the appropriate storage based on environment
export const storage: IStorage = process.env.USE_MEMORY_STORAGE === 'true' 
  ? new MemStorage() 
  : new DatabaseStorage();