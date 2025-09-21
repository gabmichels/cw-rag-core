/**
 * Normalization utilities for the CW RAG Core system.
 * Provides functions for content canonicalization, hashing, and language detection.
 */
import type { Block } from '../types/normalized.js';
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
export declare function canonicalizeForHash(content: string | Block[]): string;
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
export declare function computeSha256(input: Buffer | string): string;
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
export declare function detectLanguage(text: string): string;
