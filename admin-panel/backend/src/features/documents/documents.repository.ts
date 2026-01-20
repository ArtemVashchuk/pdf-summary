import { db } from "../../shared/database/db";
import { documents, type InsertDocument, type Document } from "../../shared/database/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export class DocumentsRepository {
    async createDocument(data: InsertDocument): Promise<Document> {
        const [document] = await db.insert(documents).values(data).returning();
        return document;
    }

    async getDocumentById(id: string): Promise<Document | undefined> {
        const [document] = await db.select().from(documents).where(eq(documents.id, id));
        return document;
    }

    async getDocuments(filters?: {
        status?: string;
        documentType?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ data: Document[]; total: number }> {
        const conditions = [];

        if (filters?.status) {
            conditions.push(eq(documents.processingStatus, filters.status));
        }

        if (filters?.documentType) {
            conditions.push(eq(documents.documentType, filters.documentType));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get total count
        const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(documents)
            .where(whereClause);

        // Get paginated data
        const data = await db
            .select()
            .from(documents)
            .where(whereClause)
            .orderBy(desc(documents.createdAt))
            .limit(filters?.limit || 50)
            .offset(filters?.offset || 0);

        return { data, total: count };
    }

    async updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document> {
        const [updated] = await db
            .update(documents)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(documents.id, id))
            .returning();
        return updated;
    }

    async deleteDocument(id: string): Promise<void> {
        await db.delete(documents).where(eq(documents.id, id));
    }

    async incrementAttempts(id: string): Promise<void> {
        await db.update(documents)
            .set({ attempts: sql`${documents.attempts} + 1`, updatedAt: new Date() })
            .where(eq(documents.id, id));
    }

    async getPendingDocuments(maxAttempts: number = 3): Promise<Document[]> {
        return await db.select()
            .from(documents)
            .where(
                and(
                    sql`${documents.processingStatus} IN ('pending', 'processing')`,
                    sql`${documents.attempts} < ${maxAttempts}`
                )
            );
    }

    async getDocumentStats(): Promise<{
        total: number;
        byType: Record<string, number>;
        byStatus: Record<string, number>;
    }> {
        const [{ total }] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(documents);

        const byType = await db
            .select({
                type: documents.documentType,
                count: sql<number>`count(*)::int`
            })
            .from(documents)
            .groupBy(documents.documentType);

        const byStatus = await db
            .select({
                status: documents.processingStatus,
                count: sql<number>`count(*)::int`
            })
            .from(documents)
            .groupBy(documents.processingStatus);

        return {
            total,
            byType: Object.fromEntries(byType.map((r: any) => [r.type || 'unknown', r.count])),
            byStatus: Object.fromEntries(byStatus.map((r: any) => [r.status, r.count]))
        };
    }
}

export const documentsRepository = new DocumentsRepository();
