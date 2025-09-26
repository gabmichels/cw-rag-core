// Browser-compatible emoji mapping
// Using a simple approach that works reliably in all environments

// Common emoji mappings that are most likely to be used
const commonEmojis: Record<string, string> = {
  // Faces & People
  'smile': '😊',
  'grin': '😁',
  'joy': '😂',
  'wink': '😉',
  'blush': '😊',
  'heart_eyes': '😍',
  'thinking': '🤔',
  'thumbsup': '👍',
  'thumbsdown': '👎',
  'wave': '👋',
  'clap': '👏',
  'ok_hand': '👌',

  // Nature & Weather
  'milky_way': '🌌',
  'star': '⭐',
  'sun': '☀️',
  'moon': '🌙',
  'fire': '🔥',
  'water_wave': '🌊',
  'rainbow': '🌈',
  'cloud': '☁️',
  'zap': '⚡',

  // Objects & Technology
  'rocket': '🚀',
  'robot': '🤖',
  'computer': '💻',
  'phone': '📱',
  'book': '📚',
  'bulb': '💡',
  'gear': '⚙️',
  'wrench': '🔧',
  'hammer': '🔨',

  // Symbols & Status
  'check': '✅',
  'x': '❌',
  'warning': '⚠️',
  'info': 'ℹ️',
  'question': '❓',
  'exclamation': '❗',
  'green_circle': '🟢',
  'yellow_circle': '🟡',
  'red_circle': '🔴',

  // Hearts & Love
  'heart': '❤️',
  'blue_heart': '💙',
  'green_heart': '💚',
  'yellow_heart': '💛',
  'purple_heart': '💜',

  // Animals
  'cat': '🐱',
  'dog': '🐶',
  'unicorn': '🦄',
  'dragon': '🐉',

  // Food
  'pizza': '🍕',
  'coffee': '☕',
  'beer': '🍺',
  'cake': '🎂'
};

/**
 * Process text to replace emoji shortcodes with actual emojis
 * Uses a curated set of common emojis for reliable browser compatibility
 * @param text The text to process
 * @returns Text with emoji shortcodes replaced
 */
export function processEmojis(text: string): string {
  return text.replace(/:([a-zA-Z0-9_+-]+):/g, (match, shortcode) => {
    return commonEmojis[shortcode] || match;
  });
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

  return commonEmojis[normalizedShortcode] || `:${normalizedShortcode}:`;
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