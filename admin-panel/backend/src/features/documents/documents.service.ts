import { documentsRepository } from "./documents.repository";
import { analyzeDocument } from "./analysis/document_analysis";
import fs from "fs";
import path from "path";

const LOG_PATH = '/app/document_service_debug.log';
function log(msg: string) {
    const logMsg = `[DOC_SERVICE] ${new Date().toISOString()} ${msg}`;
    console.log(logMsg);
    try { fs.appendFileSync(LOG_PATH, logMsg + '\n'); } catch (e) { }
}

export class DocumentProcessingService {
    private static instance: DocumentProcessingService;
    private isProcessing: boolean = false;
    private jobQueue: { documentId: string; filePath: string; mimeType: string }[] = [];

    private constructor() { }

    public static getInstance(): DocumentProcessingService {
        if (!DocumentProcessingService.instance) {
            DocumentProcessingService.instance = new DocumentProcessingService();
        }
        return DocumentProcessingService.instance;
    }

    public async queueDocument(documentId: string, filePath: string, mimeType: string) {
        log(`Queueing document ${documentId} for processing`);
        this.jobQueue.push({ documentId, filePath, mimeType });
        this.processQueue();
    }

    private async processQueue() {
        if (this.isProcessing || this.jobQueue.length === 0) return;

        this.isProcessing = true;
        const job = this.jobQueue.shift();

        if (job) {
            try {
                await this.processDocument(job.documentId, job.filePath, job.mimeType);
            } catch (error: any) {
                log(`Critical failure processing document ${job.documentId}: ${error.message}`);
                await documentsRepository.updateDocument(job.documentId, {
                    processingStatus: "failed",
                    errorMessage: error.message
                });
            } finally {
                this.isProcessing = false;
                setTimeout(() => this.processQueue(), 100);
            }
        }
    }

    private async processDocument(documentId: string, filePath: string, mimeType: string) {
        log(`Processing document ${documentId}`);

        try {
            // Update status to processing
            await documentsRepository.updateDocument(documentId, {
                processingStatus: "processing"
            });

            // Read file
            const fileBuffer = fs.readFileSync(filePath);

            // Analyze with AI (reuses Gemini pipeline)
            const analysis = await analyzeDocument(fileBuffer, mimeType);

            log(`Analysis complete for ${documentId}: type=${analysis.documentType}, confidence=${analysis.confidence}`);

            // Update document with results
            await documentsRepository.updateDocument(documentId, {
                processingStatus: "completed",
                documentType: analysis.documentType,
                summary: analysis.summary,
                extractedText: analysis.extractedText,
                detectedFields: analysis.detectedFields,
                confidence: analysis.confidence
            });

            log(`Document ${documentId} processed successfully`);

        } catch (error: any) {
            log(`Error processing document ${documentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Upload and queue a document for processing
     */
    public async uploadDocument(
        file: Express.Multer.File,
        uploadedBy: string = "admin"
    ): Promise<string> {
        log(`Uploading document: ${file.originalname}`);

        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedTypes.includes(file.mimetype) && !allowedExtensions.includes(ext)) {
            throw new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, JPG, PNG, WEBP`);
        }

        // Validate file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
            throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 50MB`);
        }

        // Determine file type
        let fileType = 'unknown';
        if (file.mimetype === 'application/pdf' || ext === '.pdf') {
            fileType = 'pdf';
        } else if (file.mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            fileType = ext.replace('.', '');
        }

        // Save file to uploads directory
        const uploadsDir = '/app/uploads/documents';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${sanitizedName}`;
        const filePath = path.join(uploadsDir, fileName);

        fs.writeFileSync(filePath, file.buffer);
        log(`File saved to ${filePath}`);

        // Create document record
        const document = await documentsRepository.createDocument({
            fileName: file.originalname,
            fileType,
            fileSize: file.size,
            filePath,
            processingStatus: "pending",
            uploadedBy
        });

        log(`Document record created: ${document.id}`);

        // Queue for processing
        this.queueDocument(document.id, filePath, file.mimetype);

        return document.id;
    }
}

export const documentProcessingService = DocumentProcessingService.getInstance();
