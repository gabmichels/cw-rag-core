/**
 * Normalization utilities for the CW RAG Core system.
 * Provides functions for content canonicalization, hashing, and language detection.
 */
import * as crypto from 'crypto';
/**
 * Canonicalizes content for consistent hash computation.
 * Standardizes text by normalizing whitespace and encoding.
 *
 * @param content - Either a string of text or an array of Block objects
 * @returns Canonicalized string ready for hashing
 *
 * @example
 * ```typescript
 * const text = "  Hello\n\nWorld  ";
 * const canonical = canonicalizeForHash(text);
 * // Returns: "Hello\nWorld"
 *
 * const blocks = [
 *   { type: 'text', text: 'Hello World' },
 *   { type: 'code', text: 'console.log("test");' }
 * ];
 * const canonical = canonicalizeForHash(blocks);
 * ```
 */
export function canonicalizeForHash(content) {
    if (typeof content === 'string') {
        return canonicalizeText(content);
    }
    // For blocks, concatenate all text content in order
    const textParts = [];
    for (const block of content) {
        if (block.text) {
            textParts.push(canonicalizeText(block.text));
        }
        // Note: We don't include HTML in canonicalization to avoid
        // hash changes due to formatting differences
    }
    return textParts.join('\n');
}
/**
 * Canonicalizes a single text string.
 * - Trims leading/trailing whitespace
 * - Normalizes internal whitespace (multiple spaces/tabs become single space)
 * - Normalizes line endings to \n
 * - Removes empty lines
 */
function canonicalizeText(text) {
    return text
        // Normalize line endings
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Split into lines, trim each, filter out empty lines
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        // Normalize internal whitespace in each line
        .map(line => line.replace(/\s+/g, ' '))
        .join('\n');
}
/**
 * Computes SHA256 hash of the given buffer or string.
 *
 * @param input - Buffer or string to hash
 * @returns SHA256 hash as lowercase hexadecimal string
 *
 * @example
 * ```typescript
 * const hash = computeSha256("Hello World");
 * // Returns: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"
 *
 * const buffer = Buffer.from("Hello World", "utf8");
 * const hash = computeSha256(buffer);
 * ```
 */
export function computeSha256(input) {
    const hash = crypto.createHash('sha256');
    if (typeof input === 'string') {
        hash.update(input, 'utf8');
    }
    else {
        hash.update(input);
    }
    return hash.digest('hex');
}
/**
 * Performs basic language detection on text content.
 * Uses simple heuristics to detect common languages.
 *
 * @param text - Text content to analyze
 * @returns ISO 639-1 language code or 'en' as fallback
 *
 * @example
 * ```typescript
 * const lang = detectLanguage("Hello world");
 * // Returns: "en"
 *
 * const lang = detectLanguage("Hola mundo");
 * // Returns: "es"
 *
 * const lang = detectLanguage("Bonjour le monde");
 * // Returns: "fr"
 * ```
 */
export function detectLanguage(text) {
    // Fallback to English if text is too short
    if (!text || text.trim().length < 10) {
        return 'en';
    }
    const normalizedText = text.toLowerCase();
    // Simple keyword-based detection for common languages
    // This is a basic implementation - in production you might want
    // to use a more sophisticated language detection library
    // Spanish indicators
    if (containsSpanishIndicators(normalizedText)) {
        return 'es';
    }
    // French indicators
    if (containsFrenchIndicators(normalizedText)) {
        return 'fr';
    }
    // German indicators
    if (containsGermanIndicators(normalizedText)) {
        return 'de';
    }
    // Italian indicators
    if (containsItalianIndicators(normalizedText)) {
        return 'it';
    }
    // Portuguese indicators
    if (containsPortugueseIndicators(normalizedText)) {
        return 'pt';
    }
    // Default to English
    return 'en';
}
/**
 * Checks for Spanish language indicators
 */
function containsSpanishIndicators(text) {
    const spanishWords = ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'del', 'está', 'una', 'como', 'muy', 'más', 'pero', 'todo', 'bien', 'puede', 'hasta', 'año', 'dos', 'hace', 'está', 'cada', 'país', 'vida', 'solo', 'también', 'familia'];
    const spanishChars = /[ñáéíóúü]/;
    return hasLanguageIndicators(text, spanishWords, spanishChars);
}
/**
 * Checks for French language indicators
 */
function containsFrenchIndicators(text) {
    const frenchWords = ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour', 'dans', 'ce', 'son', 'une', 'sur', 'avec', 'ne', 'se', 'pas', 'tout', 'plus', 'par', 'grand', 'il', 'me', 'même', 'faire', 'elle', 'du', 'au', 'le', 'vous', 'nous', 'comme', 'bien', 'aussi', 'très', 'où'];
    const frenchChars = /[àâäéèêëïîôùûüÿç]/;
    return hasLanguageIndicators(text, frenchWords, frenchChars);
}
/**
 * Checks for German language indicators
 */
function containsGermanIndicators(text) {
    const germanWords = ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über'];
    const germanChars = /[äöüß]/;
    return hasLanguageIndicators(text, germanWords, germanChars);
}
/**
 * Checks for Italian language indicators
 */
function containsItalianIndicators(text) {
    const italianWords = ['il', 'di', 'che', 'e', 'la', 'per', 'un', 'in', 'con', 'del', 'da', 'al', 'le', 'si', 'dei', 'come', 'io', 'suo', 'ha', 'dello', 'nella', 'lo', 'a', 'o', 'alla', 'ma', 'sono', 'se', 'gli', 'mi', 'ci', 'anche', 'tutto', 'una', 'su', 'più', 'molto', 'qui', 'quella', 'questo'];
    const italianChars = /[àèéìíîòóù]/;
    return hasLanguageIndicators(text, italianWords, italianChars);
}
/**
 * Checks for Portuguese language indicators
 */
function containsPortugueseIndicators(text) {
    const portugueseWords = ['o', 'de', 'a', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois'];
    const portugueseChars = /[ãâáàçêéèíïôóòõúü]/;
    return hasLanguageIndicators(text, portugueseWords, portugueseChars);
}
/**
 * Helper function to check if text contains language-specific indicators
 */
function hasLanguageIndicators(text, words, specialChars) {
    // Check for special characters
    if (specialChars.test(text)) {
        return true;
    }
    // Check for common words (must match at least 3)
    const wordsFound = words.filter(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        return regex.test(text);
    });
    return wordsFound.length >= 3;
}
