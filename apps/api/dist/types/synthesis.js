// Error types
export class AnswerSynthesisError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'AnswerSynthesisError';
    }
}
export class LLMProviderError extends AnswerSynthesisError {
    provider;
    originalError;
    constructor(message, provider, originalError) {
        super(message, 'LLM_PROVIDER_ERROR', { provider, originalError });
        this.provider = provider;
        this.originalError = originalError;
    }
}
export class CitationExtractionError extends AnswerSynthesisError {
    documentId;
    constructor(message, documentId) {
        super(message, 'CITATION_EXTRACTION_ERROR', { documentId });
        this.documentId = documentId;
    }
}
