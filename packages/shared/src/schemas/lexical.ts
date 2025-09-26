import { z } from 'zod';

/**
 * Schema for a LanguagePack.
 * Handles language-specific processing like tokenization, normalization, synonyms.
 */
export const LanguagePackSchema = z.object({
  id: z.string().min(1).max(10), // e.g., 'en', 'de'
  normalize: z.function().args(z.string()).returns(z.string()), // Normalize text (e.g., umlaut handling)
  tokenize: z.function().args(z.string()).returns(z.array(z.string())), // Tokenize text
  decompound: z.function().args(z.string()).returns(z.array(z.string())).optional(), // Decompound tokens (e.g., German)
  stopwords: z.array(z.string()), // Stopwords set
  synonyms: z.record(z.string(), z.array(z.string())), // Synonym map
  phraseSlop: z.number().min(0).max(10), // Proximity slop for phrases
  fieldMap: z.record(z.string(), z.string()), // Generic → engine field names
});

export type LanguagePack = z.infer<typeof LanguagePackSchema>;

/**
 * Schema for a DomainPack.
 * Domain-specific vocabularies and policies.
 */
export const DomainPackSchema = z.object({
  id: z.string().min(1).max(50), // e.g., 'medical', 'legal'
  dictionaries: z.record(z.string(), z.array(z.string())).optional(), // Canonical terms/aliases
  numericPatterns: z.array(z.string()).optional(), // Regex patterns for numbers/codes
  fieldBoosts: z.record(z.string(), z.number()), // Field boosts (title: 2.0, body: 1.0)
  coveragePolicy: z.object({
    short: z.string(), // e.g., "all" or "2"
    medium: z.string(),
    long: z.string(),
  }),
});

export type DomainPack = z.infer<typeof DomainPackSchema>;

/**
 * Schema for a TenantPack.
 * Tenant-specific overrides and settings.
 */
export const TenantPackSchema = z.object({
  id: z.string().min(1), // Tenant ID
  domainId: z.string(), // Reference to DomainPack
  languageDefault: z.string(), // Default language
  overrides: z.object({
    synonyms: z.record(z.string(), z.array(z.string())).optional(),
    synonymsWeight: z.number().optional(),
  }).optional(),
  systemPrompt: z.string(), // Per-tenant system prompt
});

export type TenantPack = z.infer<typeof TenantPackSchema>;

/**
 * Registry for packs per tenant.
 */
export const LexicalRegistrySchema = z.object({
  tenantId: z.string(),
  languagePacks: z.record(z.string(), LanguagePackSchema), // id -> pack
  domainPacks: z.record(z.string(), DomainPackSchema),
  tenantPack: TenantPackSchema,
  version: z.string().default('1.0'),
});

export type LexicalRegistry = z.infer<typeof LexicalRegistrySchema>;

/**
 * Default LanguagePacks.
 */
export const DEFAULT_LANGUAGE_PACKS: Record<string, Omit<LanguagePack, 'normalize' | 'tokenize' | 'decompound'>> = {
  en: {
    id: 'en',
    stopwords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
    synonyms: { 'skill': ['ability', 'competence'], 'framework': ['structure', 'system'] },
    phraseSlop: 2,
    fieldMap: { 'title': 'title', 'body': 'content', 'tags': 'tags' },
  },
  de: {
    id: 'de',
    stopwords: ['der', 'die', 'das', 'und', 'oder', 'aber', 'in', 'auf', 'an', 'zu', 'für', 'von', 'mit', 'bei'],
    synonyms: { 'fähigkeit': ['skill', 'kompetenz'], 'rahmenwerk': ['framework', 'system'] },
    phraseSlop: 2,
    fieldMap: { 'title': 'titel', 'body': 'inhalt', 'tags': 'schlagworte' },
  },
};

/**
 * Default DomainPacks.
 */
export const DEFAULT_DOMAIN_PACKS: Record<string, DomainPack> = {
  general: {
    id: 'general',
    fieldBoosts: { 'title': 2.0, 'body': 1.0, 'tags': 1.5 },
    coveragePolicy: { short: 'all', medium: '2', long: '50%' },
  },
  knowledge: {
    id: 'knowledge',
    dictionaries: { 'lore': ['knowledge', 'information'], 'recall': ['remember', 'retrieve'] },
    fieldBoosts: { 'title': 3.0, 'body': 1.0, 'tags': 2.0 },
    coveragePolicy: { short: 'all', medium: '2', long: '50%' },
  },
  crafting: {
    id: 'crafting',
    dictionaries: { 'skill': ['craft', 'technique'], 'ability': ['power', 'competence'] },
    fieldBoosts: { 'title': 2.5, 'body': 1.0, 'tags': 1.5 },
    coveragePolicy: { short: 'all', medium: '2', long: '50%' },
  },
};