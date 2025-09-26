import { LexicalRegistryService } from './lexical-registry.js';

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

    // Simple detection based on characters
    const detected = this.detectLanguage(query);

    // Fallback to tenant default
    const tenantPack = await this.registryService.getTenantPack(tenantId);
    return detected || tenantPack.languageDefault;
  }

  /**
   * Get the language pack for a detected language.
   */
  async getLanguagePack(tenantId: string, langId: string) {
    return await this.registryService.getLanguagePack(tenantId, langId);
  }

  private detectLanguage(text: string): string | null {
    // German indicators
    const germanWords = ['der', 'die', 'das', 'und', 'ist', 'mit', 'für', 'von', 'zu', 'auf'];
    const germanChars = /[äöüß]/i;

    // English indicators
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of'];

    const lowerText = text.toLowerCase();

    // Check for German characters
    if (germanChars.test(text)) return 'de';

    // Count German vs English words
    const germanCount = germanWords.filter(word => lowerText.includes(word)).length;
    const englishCount = englishWords.filter(word => lowerText.includes(word)).length;

    if (germanCount > englishCount) return 'de';
    if (englishCount > germanCount) return 'en';

    return null; // Undetermined
  }
}