import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs from 'fs';

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

function getGeminiClient(): GoogleGenerativeAI | null {
    if (genAI) return genAI;

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        log('GEMINI_API_KEY not found or is placeholder');
        return null;
    }

    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

/**
 * Analyze a document (PDF or image) and extract structured information
 * Reuses the same Gemini AI integration as voucher imports
 */
export async function analyzeDocument(fileBuffer: Buffer, mimeType: string): Promise<DocumentAnalysisResult> {
    const client = getGeminiClient();
    if (!client) {
        throw new Error("GEMINI_API_KEY_MISSING");
    }

    log(`Starting document analysis (${mimeType}, ${(fileBuffer.length / 1024).toFixed(1)}KB)...`);

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

    // Try models in order of preference (same as voucher imports)
    // Try models in order of preference (optimized for speed and cost)
    const modelsToTry = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    for (const modelName of modelsToTry) {
        log(`Trying model: ${modelName}`);

        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries) {
            try {
                const model = client.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        temperature: 0.1, // Low temperature for consistent extraction
                    }
                });

                log(`Sending request to ${modelName} (Timeout: 120s)...`);

                let inlineData: { mimeType: string; data: string };

                // Handle different file types
                if (mimeType === 'application/pdf') {
                    // Send PDF directly
                    log(`Encoding PDF (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB)...`);
                    inlineData = {
                        mimeType: 'application/pdf',
                        data: fileBuffer.toString('base64')
                    };
                } else {
                    // Convert image to JPEG for optimal processing
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

                const result = await model.generateContent([
                    { inlineData },
                    prompt
                ], { timeout: 210000 }); // 3.5 minutes timeout for large files

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
                const isRateLimit = error.message?.includes('429') ||
                    error.message?.includes('quota') ||
                    error.message?.includes('RESOURCE_EXHAUSTED') ||
                    error.message?.includes('retry');

                if (isRateLimit && retryCount < maxRetries) {
                    log(`Error triggering retry: ${error.message}`);
                    const waitTime = Math.min(20000 * Math.pow(2, retryCount), 60000);
                    log(`Rate limit/Retry on ${modelName}. Retry ${retryCount + 1}/${maxRetries} after ${waitTime / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryCount++;
                    continue;
                } else {
                    log(`Model ${modelName} failed: ${error.message}`);
                    break;
                }
            }
        }
    }

    log("All models failed.");
    throw new Error("Document analysis failed: All AI models exhausted");
}
