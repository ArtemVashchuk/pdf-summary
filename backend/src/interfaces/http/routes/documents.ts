import { Router } from "express";
import multer from "multer";
import { documentsRepository } from "../../../features/documents/documents.repository";
import { documentProcessingService } from "../../../features/documents/documents.service";
import fs from "fs";

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * POST /api/documents/upload
 * Upload one or more documents for AI analysis
 */
router.post("/upload", upload.array("files", 10), async (req, res) => {
    console.log("Document upload endpoint hit");
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files provided" });
        }

        const uploadedBy = req.session.userId || "admin";
        const documentIds: string[] = [];

        for (const file of files) {
            // Fix encoding for non-ASCII filenames (Cyrillic etc.)
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

            try {
                const documentId = await documentProcessingService.uploadDocument(file, uploadedBy);
                documentIds.push(documentId);
            } catch (error: any) {
                console.error(`Failed to upload ${file.originalname}:`, error);
                return res.status(400).json({
                    error: `Failed to upload ${file.originalname}: ${error.message}`
                });
            }
        }

        res.json({
            success: true,
            message: `${documentIds.length} document(s) uploaded and queued for processing`,
            documentIds
        });

    } catch (error: any) {
        console.error("Document upload failed:", error);
        res.status(500).json({
            error: "Upload failed",
            details: error.message
        });
    }
});

/**
 * GET /api/documents
 * List all documents with optional filters
 */
router.get("/", async (req, res) => {
    try {
        const { status, documentType, page = 1, limit = 50 } = req.query;

        const result = await documentsRepository.getDocuments({
            status: status as string,
            documentType: documentType as string,
            limit: Number(limit),
            offset: (Number(page) - 1) * Number(limit)
        });

        res.json(result);
    } catch (error: any) {
        console.error("Failed to fetch documents:", error);
        res.status(500).json({ error: "Failed to fetch documents" });
    }
});

/**
 * GET /api/documents/stats
 * Get document statistics
 */
router.get("/stats", async (_req, res) => {
    try {
        const stats = await documentsRepository.getDocumentStats();
        res.json(stats);
    } catch (error: any) {
        console.error("Failed to fetch stats:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

/**
 * GET /api/documents/:id
 * Get a specific document by ID
 */
router.get("/:id", async (req, res) => {
    try {
        const document = await documentsRepository.getDocumentById(req.params.id);

        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        res.json(document);
    } catch (error: any) {
        console.error("Failed to fetch document:", error);
        res.status(500).json({ error: "Failed to fetch document" });
    }
});

/**
 * DELETE /api/documents/:id
 * Delete a document and its file
 */
router.delete("/:id", async (req, res) => {
    try {
        const document = await documentsRepository.getDocumentById(req.params.id);

        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        // Delete file from filesystem
        try {
            if (fs.existsSync(document.filePath)) {
                fs.unlinkSync(document.filePath);
            }
        } catch (fileError) {
            console.error("Failed to delete file:", fileError);
            // Continue with database deletion even if file deletion fails
        }

        // Delete from database
        await documentsRepository.deleteDocument(req.params.id);

        res.json({ success: true, message: "Document deleted" });
    } catch (error: any) {
        console.error("Failed to delete document:", error);
        res.status(500).json({ error: "Failed to delete document" });
    }
});

/**
 * POST /api/documents/bulk-delete
 * Delete multiple documents
 */
router.post("/bulk-delete", async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "No document IDs provided" });
        }

        let deletedCount = 0;
        for (const id of ids) {
            try {
                const document = await documentsRepository.getDocumentById(id);
                if (document) {
                    // Delete file
                    if (fs.existsSync(document.filePath)) {
                        fs.unlinkSync(document.filePath);
                    }
                    // Delete from DB
                    await documentsRepository.deleteDocument(id);
                    deletedCount++;
                }
            } catch (error) {
                console.error(`Failed to delete document ${id}:`, error);
            }
        }

        res.json({
            success: true,
            message: `${deletedCount} document(s) deleted`,
            deletedCount
        });
    } catch (error: any) {
        console.error("Bulk delete failed:", error);
        res.status(500).json({ error: "Bulk delete failed" });
    }
});

export default router;
