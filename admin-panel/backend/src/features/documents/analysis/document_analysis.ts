import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs from 'fs';
import { GoogleAIFileManager } from "@google/generative-ai/server";

const LOG_PATH = './logs/analysis.log';
function log(msg: string) {
    console.log(`[DOCUMENT_ANALYSIS] ${msg}`);
    try {
        if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });
        fs.appendFileSync(LOG_PATH, `[DOCUMENT_ANALYSIS] ${new Date().toISOString()} ${msg}\n`);
    } catch (e) { }
}

export interface DocumentAnalysisResult {
    documentType: string;
    summary: string;
    extractedText: string;
    detectedFields: {
        dates: string[];
        names: string[];
        organizations: string[];
        amounts: string[];
        references: string[];
    };
    confidence: 'high' | 'medium' | 'low';
    rawResponse: string;
}

let genAI: GoogleGenerativeAI | null = null;
let fileManager: any = null;

function getGeminiClient(): { ai: GoogleGenerativeAI; fm: any } | null {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        log('GEMINI_API_KEY not found or is placeholder');
        return null;
    }

    if (!genAI) genAI = new GoogleGenerativeAI(apiKey);
    if (!fileManager) fileManager = new GoogleAIFileManager(apiKey);

    return { ai: genAI, fm: fileManager };
}

/**
 * Analyze a document (PDF or image) and extract structured information
 */
export async function analyzeDocument(fileBuffer: Buffer, mimeType: string, filePath?: string): Promise<DocumentAnalysisResult> {
    const client = getGeminiClient();
    if (!client) {
        throw new Error("GEMINI_API_KEY_MISSING");
    }

    const { ai, fm } = client;
    const isVeryLargeFile = fileBuffer.length > 5 * 1024 * 1024; // > 5MB
    const isLargeFile = fileBuffer.length > 2 * 1024 * 1024; // > 2MB

    // For very large PDFs (like books), extract text locally to avoid API limits
    let extractedPdfText: string | null = null;
    if (isVeryLargeFile && mimeType === 'application/pdf') {
        try {
            log(`Large PDF detected (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB). Extracting text locally...`);
            // Lazy load pdf-parse
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(fileBuffer);
            // Limit to first ~50000 chars (~20-30 pages worth of text)
            const maxChars = 50000;
            extractedPdfText = pdfData.text.substring(0, maxChars);
            if (pdfData.text.length > maxChars) {
                extractedPdfText += `\n\n[... Text truncated. Original document has ${pdfData.numpages} pages and ${pdfData.text.length} characters ...]`;
            }
            log(`Extracted ${extractedPdfText!.length} characters from ${pdfData.numpages} pages`);
        } catch (e: any) {
            log(`PDF text extraction failed: ${e.message}. Will try full file upload.`);
        }
    }

    const strategy = extractedPdfText ? 'TextExtraction' : (isLargeFile ? 'FileAPI' : 'Base64');
    log(`Starting document analysis (${mimeType}, ${(fileBuffer.length / 1024).toFixed(1)}KB, strategy=${strategy})...`);

    const prompt = `
Analyze this document and extract key information.

Your task:
1. Identify the document type (choose ONE): invoice, contract, receipt, report, id_document, letter, form, unknown
2. Extract ALL visible text (OCR)
3. Identify structured information:
   - Dates (in YYYY-MM-DD format if possible)
   - Names of people
   - Organization/company names
   - Monetary amounts (with currency if visible)
   - Reference numbers, IDs, or codes
4. Write a comprehensive and detailed summary (at least 6-12 sentences) explaining exactly what this document is, its primary purpose, and a thorough breakdown of its key points and any significant details found.
5. Assess confidence level based on text clarity: high, medium, or low

Return ONLY valid JSON (no markdown, no code blocks):
{
  "documentType": "invoice",
  "extractedText": "Full text content here...",
  "summary": "This document is a formal invoice issued by Company X to Client Y for professional services rendered throughout the month of December 2024. It details a total amount due of $1,234.56, which covers several specific line items including software development and consulting. The invoice includes crucial payment information, specifying that the full balance must be settled by January 15, 2025. Additionally, it references a specific purchase order number, PO-9876, and outlines the late payment policy. The document is signed by the finance department of Company X and includes their contact details for any billing inquiries. It serves as both a request for payment and a record of services provided during the final quarter of the fiscal year.",
  "detectedFields": {
    "dates": ["2024-12-31", "2025-01-15"],
    "names": ["John Doe", "Jane Smith"],
    "organizations": ["Company X", "Client Y"],
    "amounts": ["$1,234.56"],
    "references": ["INV-2024-001"]
  },
  "confidence": "high"
}
`;

    // Models prioritized by highest RPM limits from user's API dashboard:
    // gemini-2.5-flash-lite: 10 RPM, gemini-2.5-flash: 5 RPM, gemini-1.5-flash: 15 RPM (if available)
    const modelsToTry = [
        "gemini-2.5-flash-lite",  // 10 RPM - highest for 2.5 series
        "gemini-2.5-flash",       // 5 RPM 
        "gemini-1.5-flash",       // 15 RPM on standard Free Tier
        "gemini-1.5-pro"          // 2 RPM - fallback
    ];

    for (const modelName of modelsToTry) {
        try {
            log(`Attempting analysis with ${modelName}...`);
            const model = ai.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                }
            });

            let content: any[] = [];
            let useBase64Fallback = false;

            // Strategy 1: Use extracted text for very large PDFs
            if (extractedPdfText) {
                log(`Using extracted text (${extractedPdfText.length} chars) for analysis...`);
                content = [prompt + "\n\nDocument Text:\n" + extractedPdfText];
            }
            // Strategy 2: Use File API for large files
            else if (isLargeFile && filePath) {
                try {
                    log(`Uploading to Gemini File API...`);
                    const uploadResult = await fm.uploadFile(filePath, {
                        mimeType,
                        displayName: `doc_${Date.now()}`
                    });
                    log(`File uploaded: ${uploadResult.file.uri}`);

                    content = [
                        {
                            fileData: {
                                mimeType: uploadResult.file.mimeType,
                                fileUri: uploadResult.file.uri
                            }
                        },
                        prompt
                    ];
                } catch (uploadError: any) {
                    log(`File API upload failed: ${uploadError.message}. Falling back to base64...`);
                    useBase64Fallback = true;
                }
            }

            if (!isLargeFile || useBase64Fallback) {
                let inlineData: { mimeType: string; data: string };
                if (mimeType === 'application/pdf') {
                    inlineData = {
                        mimeType: 'application/pdf',
                        data: fileBuffer.toString('base64')
                    };
                } else {
                    try {
                        const resized = await sharp(fileBuffer)
                            .resize({ width: 2000, withoutEnlargement: true })
                            .jpeg({ quality: 90 })
                            .toBuffer();
                        inlineData = {
                            mimeType: 'image/jpeg',
                            data: resized.toString('base64')
                        };
                    } catch (e) {
                        inlineData = {
                            mimeType: 'image/jpeg',
                            data: (await sharp(fileBuffer).jpeg().toBuffer()).toString('base64')
                        };
                    }
                }
                content = [{ inlineData }, prompt];
            }

            const result = await model.generateContent(content, { timeout: 210000 });
            const text = result.response.text();
            log(`Raw Response (${modelName}): ${text.substring(0, 200)}...`);

            // Parse JSON response
            let jsonStr = text;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }

            const parsed = JSON.parse(jsonStr);

            log(`Successfully analyzed document with ${modelName}`);

            return {
                documentType: parsed.documentType || 'unknown',
                summary: parsed.summary || 'No summary available',
                extractedText: parsed.extractedText || '',
                detectedFields: {
                    dates: Array.isArray(parsed.detectedFields?.dates) ? parsed.detectedFields.dates : [],
                    names: Array.isArray(parsed.detectedFields?.names) ? parsed.detectedFields.names : [],
                    organizations: Array.isArray(parsed.detectedFields?.organizations) ? parsed.detectedFields.organizations : [],
                    amounts: Array.isArray(parsed.detectedFields?.amounts) ? parsed.detectedFields.amounts : [],
                    references: Array.isArray(parsed.detectedFields?.references) ? parsed.detectedFields.references : [],
                },
                confidence: (parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low')
                    ? parsed.confidence
                    : 'medium',
                rawResponse: `AI_GEMINI_${modelName}`
            };

        } catch (error: any) {
            const isRateLimit = error.message?.includes('429') || error.message?.includes('quota');
            const isModelNotFound = error.message?.includes('404') || error.message?.includes('not found');

            if (isRateLimit) {
                log(`Rate limit hit for ${modelName}. Moving to next model.`);
            } else if (isModelNotFound) {
                log(`Model ${modelName} not available. Moving to next model.`);
            } else {
                log(`Error with ${modelName}: ${error.message}`);
            }
            // Continue to next model in loop
        }
    }

    throw new Error("All AI models failed to process the document. Potentially quota exceeded or service down.");
}
