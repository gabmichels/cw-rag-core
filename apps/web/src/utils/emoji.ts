import * as emoji from 'node-emoji';

/**
 * Process text to replace emoji shortcodes with actual emojis
 * Uses the comprehensive node-emoji library for full emoji support
 * @param text The text to process
 * @returns Text with emoji shortcodes replaced
 */
export function processEmojis(text: string): string {
  // Use node-emoji to handle all emoji shortcodes
  // This supports thousands of emojis including special ones like :milky_way: → 🌌
  return emoji.emojify(text);
}

/**
 * Check if text contains emoji shortcodes
 * @param text Text to check
 * @returns True if text contains emoji shortcodes
 */
export function hasEmojiShortcodes(text: string): boolean {
  return /:[a-zA-Z0-9_+-]+:/.test(text);
}

/**
 * Get emoji from shortcode
 * @param shortcode The shortcode (with or without colons)
 * @returns The emoji or the original shortcode if not found
 */
export function getEmoji(shortcode: string): string {
  const normalizedShortcode = shortcode.startsWith(':') && shortcode.endsWith(':')
    ? shortcode.slice(1, -1)
    : shortcode;

  return emoji.get(normalizedShortcode) || `:${normalizedShortcode}:`;
}

/**
 * Extract all emoji shortcodes from text
 * @param text Text to extract from
 * @returns Array of found shortcodes
 */
export function extractEmojiShortcodes(text: string): string[] {
  const matches = text.match(/:[a-zA-Z0-9_+-]+:/g);
  return matches || [];
}

/**
 * Check if a string contains actual emoji characters (not shortcodes)
 * @param text Text to check
 * @returns True if text contains emoji characters
 */
export function hasEmojis(text: string): boolean {
  // Simple check for common emoji characters
  const emojiRegex = /[\u2600-\u27BF]|[\uD83C][\uDF00-\uDFFF]|[\uD83D][\uDC00-\uDE4F]|[\uD83D][\uDE80-\uDEFF]/;
  return emojiRegex.test(text);
}

export default {
  processEmojis,
  hasEmojiShortcodes,
  hasEmojis,
  getEmoji,
  extractEmojiShortcodes,
};