import { LanguageRouter, LexicalRegistryService, FeatureExtractor, QueryBuilder } from '@cw-rag-core/shared';
import { QdrantClient, QdrantClientStub } from './qdrant.js';

export interface LexicalSearchContext {
  tenantId: string;
  langHint?: string;
  debug?: boolean;
}

export interface LexicalResult {
  id: string;
  score: number;
  content: string;
  metadata: any;
}

export interface LexicalResults {
  results: LexicalResult[];
  diagnostics: {
    lang: string;
    coreMatched: string[];
    phrasesMatched: string[];
    fieldsHit: Record<string, boolean>;
    coverageRatio: number;
    notes?: string[];
  };
}

/**
 * Lexical search façade.
 */
export class LexicalSearch {
  private languageRouter: LanguageRouter;
  private registryService: LexicalRegistryService;
  private featureExtractor: FeatureExtractor;
  private queryBuilder: QueryBuilder;
  private qdrantClient: QdrantClient;

  constructor(qdrantClient: QdrantClient) {
    this.languageRouter = new LanguageRouter();
    this.registryService = new LexicalRegistryService();
    this.featureExtractor = new FeatureExtractor();
    this.queryBuilder = new QueryBuilder();
    this.qdrantClient = qdrantClient;
  }

  /**
   * Perform lexical search.
   */
  async search(query: string, ctx: LexicalSearchContext): Promise<LexicalResults> {
    const { tenantId, langHint, debug } = ctx;

    // Detect language
    const lang = await this.languageRouter.detect(query, { tenantId, langHint });
    const languagePack = await this.languageRouter.getLanguagePack(tenantId, lang);
    if (!languagePack) throw new Error(`Language pack not found for ${lang}`);

    // Load packs
    const tenantPack = await this.registryService.getTenantPack(tenantId);
    const domainPack = await this.registryService.getDomainPack(tenantId, tenantPack.domainId);
    if (!domainPack) throw new Error(`Domain pack not found for ${tenantPack.domainId}`);

    // Extract features
    const features = this.featureExtractor.run(query, { languagePack, domainPack });

    // Build query
    const dsl = this.queryBuilder.build(features, { tenantPack, languagePack, domainPack });

    // Execute search (placeholder: adapt DSL to Qdrant)
    const results = await this.executeQuery(dsl, tenantId);

    // Diagnostics
    const diagnostics = {
      lang,
      coreMatched: features.core,
      phrasesMatched: features.phrases,
      fieldsHit: { content: true }, // Placeholder
      coverageRatio: features.core.length / features.stats.len,
      notes: debug ? [`Query: ${query}`, `Features: ${JSON.stringify(features)}`] : undefined,
    };

    return { results, diagnostics };
  }

  private async executeQuery(dsl: any, tenantId: string): Promise<LexicalResult[]> {
    // Placeholder: convert DSL to Qdrant scroll with filters
    const filters = dsl.filters.map((f: any) => ({
      key: f.key,
      match: f.match,
    }));

    const scrollResult = await this.qdrantClient.scroll(`${tenantId}_collection`, {
      filter: { must: filters },
      limit: 10,
      with_payload: true,
      with_vector: false,
    });

    return scrollResult.points.map((point) => ({
      id: point.id.toString(),
      score: 1.0, // Placeholder score
      content: point.payload?.content || '',
      metadata: point.payload || {},
    }));
  }
}

// Export façade function
export async function lexicalSearch(query: string, ctx: LexicalSearchContext): Promise<LexicalResults> {
  // Assume qdrantClient is available (inject in real usage)
  const qdrantClient = new QdrantClientStub(); // Placeholder
  const search = new LexicalSearch(qdrantClient);
  return search.search(query, ctx);
}