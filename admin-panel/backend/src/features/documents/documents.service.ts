import { documentsRepository } from "./documents.repository";
import { analyzeDocument } from "./analysis/document_analysis";
import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), 'logs', 'document_service.log');
function log(msg: string) {
    const logMsg = `[DOC_SERVICE] ${new Date().toISOString()} ${msg}`;
    console.log(logMsg);
    try {
        if (!fs.existsSync(path.join(process.cwd(), 'logs'))) fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
        fs.appendFileSync(LOG_PATH, logMsg + '\n');
    } catch (e) { }
}

export class DocumentProcessingService {
    private static instance: DocumentProcessingService;
    private activeCount: number = 0;
    private readonly MAX_CONCURRENT = 3;
    private currentlyProcessingIds: Set<string> = new Set();
    private jobQueue: { documentId: string; filePath: string; mimeType: string }[] = [];
    private readonly MAX_ATTEMPTS = 3;
    private readonly RECOVERY_INTERVAL = 30000; // 30 seconds

    private constructor() {
        // Start background recovery service
        this.startRecoveryService();
    }

    public static getInstance(): DocumentProcessingService {
        if (!DocumentProcessingService.instance) {
            DocumentProcessingService.instance = new DocumentProcessingService();
        }
        return DocumentProcessingService.instance;
    }

    private startRecoveryService() {
        log("Starting background recovery service...");
        setInterval(async () => {
            try {
                const pending = await documentsRepository.getPendingDocuments(this.MAX_ATTEMPTS);
                for (const doc of pending) {
                    // Only queue if not already in queue AND not currently being processed
                    if (!this.jobQueue.some(job => job.documentId === doc.id) && !this.currentlyProcessingIds.has(doc.id)) {
                        log(`Recovering stuck/pending document: ${doc.id} (${doc.fileName})`);
                        // Guess mimeType from fileType extension if possible, or use a default
                        const mimeType = doc.fileType === 'pdf' ? 'application/pdf' : `image/${doc.fileType}`;
                        this.queueDocument(doc.id, doc.filePath, mimeType);
                    }
                }
            } catch (err) {
                log(`Recovery service error: ${err}`);
            }
        }, this.RECOVERY_INTERVAL);
    }

    public async queueDocument(documentId: string, filePath: string, mimeType: string) {
        // Prevent duplicate queueing
        if (this.jobQueue.some(job => job.documentId === documentId) || this.currentlyProcessingIds.has(documentId)) return;

        log(`Queueing document ${documentId} for processing`);
        this.jobQueue.push({ documentId, filePath, mimeType });
        this.processQueue();
    }

    private async processQueue() {
        if (this.activeCount >= this.MAX_CONCURRENT || this.jobQueue.length === 0) return;

        const job = this.jobQueue.shift();
        if (!job) return;

        this.activeCount++;
        this.currentlyProcessingIds.add(job.documentId);

        // Process in background without awaiting here to allow parallelism
        this.runJob(job).finally(() => {
            this.activeCount--;
            this.currentlyProcessingIds.delete(job.documentId);
            // Immediately check for next job
            this.processQueue();
        });

        // If we have more slots and more jobs, try to launch another one
        if (this.activeCount < this.MAX_CONCURRENT && this.jobQueue.length > 0) {
            this.processQueue();
        }
    }

    private async runJob(job: { documentId: string; filePath: string; mimeType: string }) {
        try {
            await this.processDocument(job.documentId, job.filePath, job.mimeType);
        } catch (error: any) {
            log(`Critical failure processing document ${job.documentId}: ${error.message}`);

            // Get current attempt count
            const doc = await documentsRepository.getDocumentById(job.documentId);
            const currentAttempts = doc?.attempts || 0;

            const isFileNotFound = error.code === 'FILE_NOT_FOUND' || error.message?.includes('FileNotFound');

            if (currentAttempts < this.MAX_ATTEMPTS && !isFileNotFound) {
                log(`Retrying document ${job.documentId} later (attempt ${currentAttempts + 1}/${this.MAX_ATTEMPTS})`);
                await documentsRepository.updateDocument(job.documentId, {
                    processingStatus: "pending",
                    errorMessage: `Attempt ${currentAttempts + 1} failed: ${error.message}`
                });
            } else {
                const reason = isFileNotFound ? "File missing from server" : `Exceeded ${this.MAX_ATTEMPTS} attempts`;
                log(`Document ${job.documentId} failed permanently: ${reason}`);
                await documentsRepository.updateDocument(job.documentId, {
                    processingStatus: "failed",
                    errorMessage: `${reason}. Last error: ${error.message}`
                });
            }
        }
    }

    private async processDocument(documentId: string, filePath: string, mimeType: string) {
        log(`Processing document ${documentId}`);

        try {
            // Increment attempts and set to processing
            await documentsRepository.incrementAttempts(documentId);
            await documentsRepository.updateDocument(documentId, {
                processingStatus: "processing"
            });

            // Normalize path for local vs docker environments
            let absolutePath = filePath;
            if (filePath.startsWith('/app/')) {
                // If it's a Linux/Docker path but we're on Windows/Local, try to resolve it relative to current dir
                const relativePath = filePath.replace('/app/', '');
                absolutePath = path.join(process.cwd(), relativePath);
            }

            if (!fs.existsSync(absolutePath)) {
                // Try one more fallback: look directly in the uploads/documents folder by filename
                const fileName = path.basename(filePath);
                const fallbackPath = path.join(process.cwd(), 'uploads', 'documents', fileName);
                if (fs.existsSync(fallbackPath)) {
                    absolutePath = fallbackPath;
                } else {
                    const error = new Error(`FileNotFound: ${absolutePath}`);
                    (error as any).code = 'FILE_NOT_FOUND';
                    throw error;
                }
            }

            // Read file
            const fileBuffer = fs.readFileSync(absolutePath);

            // Analyze with AI (uses Gemini pipeline with File API support)
            const analysis = await analyzeDocument(fileBuffer, mimeType, absolutePath);

            log(`Analysis complete for ${documentId}: type=${analysis.documentType}, confidence=${analysis.confidence}`);

            // Update document with results
            await documentsRepository.updateDocument(documentId, {
                processingStatus: "completed",
                documentType: analysis.documentType,
                summary: analysis.summary,
                extractedText: analysis.extractedText,
                detectedFields: analysis.detectedFields,
                confidence: analysis.confidence,
                errorMessage: null // Clear any previous error messages on success
            });

            log(`Document ${documentId} processed successfully`);

        } catch (error: any) {
            log(`Error in processDocument for ${documentId}: ${error.message}`);
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
        const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
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
            uploadedBy,
            attempts: 0
        });

        log(`Document record created: ${document.id}`);

        // Queue for processing
        this.queueDocument(document.id, filePath, file.mimetype);

        return document.id;
    }
}

export const documentProcessingService = DocumentProcessingService.getInstance();
