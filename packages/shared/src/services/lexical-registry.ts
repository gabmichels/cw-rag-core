import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PersistedLexicalRegistrySchema, LexicalRegistrySchema, LexicalRegistry, PersistedLexicalRegistry, DEFAULT_LANGUAGE_PACKS, DEFAULT_DOMAIN_PACKS, LanguagePack, DomainPack, TenantPack } from '../schemas/lexical.js';

/**
 * Service for loading and persisting tenant-scoped lexical registries.
 */
export class LexicalRegistryService {
  private registryDir: string;

  constructor(registryDir: string = './tenants') {
    this.registryDir = registryDir;
  }

  /**
   * Load the lexical registry for a tenant.
   * If no registry exists, create one with defaults.
   */
  async loadRegistry(tenantId: string): Promise<LexicalRegistry> {
    const filePath = this.getRegistryPath(tenantId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = yaml.load(content) as any;
      const persistedRegistry = PersistedLexicalRegistrySchema.parse(data);

      if (persistedRegistry.tenantId !== tenantId) {
        throw new Error(`Registry tenant mismatch: expected ${tenantId}, got ${persistedRegistry.tenantId}`);
      }

      // Add functions to language packs
      const registry: LexicalRegistry = {
        ...persistedRegistry,
        languagePacks: this.addFunctionsToLanguagePacks(persistedRegistry.languagePacks),
      };

      console.log(`Loaded lexical registry for tenant ${tenantId}`);
      return registry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`No lexical registry found for tenant ${tenantId}, creating default`);
        const defaultRegistry = await this.createDefaultRegistry(tenantId);
        await this.saveRegistry(defaultRegistry);
        return defaultRegistry;
      }
      throw error;
    }
  }

  /**
   * Save the lexical registry for a tenant.
   */
  async saveRegistry(registry: LexicalRegistry): Promise<void> {
    const filePath = this.getRegistryPath(registry.tenantId);
    const persistedRegistry: PersistedLexicalRegistry = {
      tenantId: registry.tenantId,
      languagePacks: this.removeFunctionsFromLanguagePacks(registry.languagePacks),
      domainPacks: registry.domainPacks,
      tenantPack: registry.tenantPack,
      version: registry.version,
    };
    const data = {
      ...persistedRegistry,
      lastUpdated: new Date().toISOString(),
    };

    const yamlContent = yaml.dump(data);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, yamlContent, 'utf-8');

    console.log(`Saved lexical registry for tenant ${registry.tenantId}`);
  }

  /**
   * Get a language pack by ID.
   */
  async getLanguagePack(tenantId: string, langId: string): Promise<LanguagePack | null> {
    const registry = await this.loadRegistry(tenantId);
    return registry.languagePacks[langId] || null;
  }

  /**
   * Get a domain pack by ID.
   */
  async getDomainPack(tenantId: string, domainId: string): Promise<DomainPack | null> {
    const registry = await this.loadRegistry(tenantId);
    return registry.domainPacks[domainId] || null;
  }

  /**
   * Get the tenant pack.
   */
  async getTenantPack(tenantId: string): Promise<TenantPack> {
    const registry = await this.loadRegistry(tenantId);
    return registry.tenantPack;
  }

  private getRegistryPath(tenantId: string): string {
    return path.join(this.registryDir, tenantId, 'lexical.yaml');
  }

  private async createDefaultRegistry(tenantId: string): Promise<LexicalRegistry> {
    const tenantPack: TenantPack = {
      id: tenantId,
      domainId: 'general',
      languageDefault: 'en',
      systemPrompt: 'You are a helpful assistant.',
    };

    const persistedRegistry = {
      tenantId,
      languagePacks: DEFAULT_LANGUAGE_PACKS,
      domainPacks: DEFAULT_DOMAIN_PACKS,
      tenantPack,
      version: '1.0',
    };

    // Add functions for runtime use
    return {
      ...persistedRegistry,
      languagePacks: this.addFunctionsToLanguagePacks(persistedRegistry.languagePacks),
    };
  }

  private normalizeText(text: string, lang: string): string {
    let normalized = text.toLowerCase();
    if (lang === 'de') {
      // Handle German umlauts and ß
      normalized = normalized
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss');
    }
    return normalized;
  }

  private tokenizeText(text: string, lang: string): string[] {
    const normalized = this.normalizeText(text, lang);
    // Simple tokenization: split on whitespace and punctuation
    return normalized.split(/[\s\.,!?;:]+/).filter(token => token.length > 0);
  }

  private decompoundGerman(token: string): string[] {
    // Simple German decompounding (placeholder)
    if (token.length > 10) {
      // Split long compounds
      const mid = Math.floor(token.length / 2);
      return [token.slice(0, mid), token.slice(mid)];
    }
    return [token];
  }

  private addFunctionsToLanguagePacks(packs: Record<string, any>): Record<string, LanguagePack> {
    const result: Record<string, LanguagePack> = {};
    for (const [id, pack] of Object.entries(packs)) {
      result[id] = {
        ...pack,
        normalize: (text: string) => this.normalizeText(text, id),
        tokenize: (text: string) => this.tokenizeText(text, id),
        decompound: id === 'de' ? (token: string) => this.decompoundGerman(token) : undefined,
      };
    }
    return result;
  }

  private removeFunctionsFromLanguagePacks(packs: Record<string, LanguagePack>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [id, pack] of Object.entries(packs)) {
      const { normalize, tokenize, decompound, ...rest } = pack;
      result[id] = rest;
    }
    return result;
  }
}