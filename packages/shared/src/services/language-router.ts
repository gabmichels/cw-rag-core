import { LexicalRegistryService } from './lexical-registry.js';
import { detectLanguage } from '../utils/normalization.js';

/**
 * Service for detecting language from query and loading language packs.
 */
export class LanguageRouter {
  private registryService: LexicalRegistryService;

  constructor(registryService?: LexicalRegistryService) {
    this.registryService = registryService || new LexicalRegistryService();
  }

  /**
   * Detect language from query and context.
   */
  async detect(query: string, ctx: { tenantId: string; langHint?: string }): Promise<string> {
    const { tenantId, langHint } = ctx;

    // If hint provided, use it
    if (langHint) {
      const pack = await this.registryService.getLanguagePack(tenantId, langHint);
      if (pack) return langHint;
    }

    // Use comprehensive language detection
    const detected = detectLanguage(query);

    // Fallback to tenant default if detection fails
    const tenantPack = await this.registryService.getTenantPack(tenantId);
    return detected || tenantPack.languageDefault;
  }

  /**
   * Get the language pack for a detected language.
   */
  async getLanguagePack(tenantId: string, langId: string) {
    return await this.registryService.getLanguagePack(tenantId, langId);
  }
}