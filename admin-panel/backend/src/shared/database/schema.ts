import { pgTable, text, integer, timestamp, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Documents (PDF Summary Project Core)
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // pdf, jpg, png, webp
  fileSize: integer("file_size").notNull(), // bytes
  filePath: text("file_path").notNull(), // storage path

  // AI-extracted information
  documentType: text("document_type"), // invoice, contract, receipt, report, id, unknown
  summary: text("summary"), // 3-6 sentence summary
  extractedText: text("extracted_text"), // full OCR text

  // Structured fields (JSON for flexibility)
  detectedFields: jsonb("detected_fields"), // { dates: [], names: [], amounts: [], references: [] }

  // Metadata
  confidence: text("confidence"), // high, medium, low
  processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),

  uploadedBy: text("uploaded_by"), // admin user ID or 'admin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  idxStatus: index("idx_documents_status").on(t.processingStatus),
  idxType: index("idx_documents_type").on(t.documentType),
  idxCreated: index("idx_documents_created").on(t.createdAt),
}));

export const insertDocumentSchema = createInsertSchema(documents);
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
