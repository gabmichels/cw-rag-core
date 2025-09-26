import { SpaceRegistryService } from './space-registry.js';
import { FALLBACK_SPACE_ID, Space } from '../schemas/spaces.js';

/**
 * Input for space resolution.
 */
export interface SpaceResolutionInput {
  tenantId: string;
  text: string; // Sample text from document
  source?: string; // e.g., 'n8n', 'manual'
  owner?: string; // User or system
}

/**
 * Output of space resolution.
 */
export interface SpaceResolutionResult {
  spaceId: string;
  confidence: number; // 0-1
  needsReview: boolean;
  autoCreated?: boolean;
}

/**
 * Service for resolving documents to spaces using catalog matching and auto-creation.
 */
export class SpaceResolver {
  private registryService: SpaceRegistryService;

  // Thresholds for auto-creation
  private readonly MIN_KEYWORD_MATCHES = 1;
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.6;
  private readonly CLUSTER_SIZE_THRESHOLD = 5; // For future clustering
  private readonly TRUSTED_SOURCES = ['n8n', 'api'];

  // Catalog keywords for spaces (expandable)
  private readonly CATALOG_KEYWORDS: Record<string, string[]> = {
    hr: ['human resources', 'employee', 'policy', 'recruitment', 'benefits'],
    legal: ['contract', 'compliance', 'law', 'regulation', 'agreement'],
    finance: ['budget', 'financial', 'report', 'accounting', 'expense'],
    sales: ['sales', 'lead', 'crm', 'customer', 'deal'],
    marketing: ['campaign', 'brand', 'marketing', 'advertising', 'promotion'],
    product: ['product', 'spec', 'roadmap', 'requirement', 'feature'],
    'eng-backend': ['backend', 'api', 'database', 'server', 'infrastructure'],
    'eng-frontend': ['frontend', 'ui', 'client', 'interface', 'user experience'],
    devops: ['ci/cd', 'deployment', 'infrastructure', 'monitoring', 'automation'],
    security: ['security', 'audit', 'compliance', 'threat', 'protection'],
    support: ['faq', 'help', 'support', 'troubleshooting', 'customer service'],
    'it-helpdesk': ['it', 'hardware', 'software', 'technical support', 'helpdesk'],
    'data-analytics': ['data', 'analytics', 'report', 'bi', 'dashboard'],
    'personal-health': ['health', 'medical', 'fitness', 'wellness', 'doctor'],
    'personal-finance': ['finance', 'banking', 'investment', 'saving', 'budget'],
    'personal-travel': ['travel', 'booking', 'itinerary', 'vacation', 'trip'],
    'personal-learning': ['learning', 'course', 'education', 'study', 'training'],
    'personal-projects': ['project', 'idea', 'planning', 'task', 'goal'],
    'personal-home': ['home', 'maintenance', 'family', 'household', 'organization'],
    'personal-media': ['book', 'movie', 'review', 'entertainment', 'media'],
    knowledge: ['knowledge', 'lore', 'information', 'fact', 'encyclopedia'], // For the example doc
    crafting: ['crafting', 'skill', 'ability', 'technique', 'creation'], // For the example doc
  };

  constructor(registryService?: SpaceRegistryService) {
    this.registryService = registryService || new SpaceRegistryService();
  }

  /**
   * Resolve a space for the given input.
   */
  async resolveSpace(input: SpaceResolutionInput): Promise<SpaceResolutionResult> {
    const { tenantId, text, source, owner } = input;

    // Load registry
    const registry = await this.registryService.loadRegistry(tenantId);

    // Attempt catalog match
    const match = this.findCatalogMatch(text);
    if (match && match.confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
      return {
        spaceId: match.spaceId,
        confidence: match.confidence,
        needsReview: false,
      };
    }

    // Check if auto-create conditions met
    const canAutoCreate = this.canAutoCreate(text, source);
    if (canAutoCreate) {
      const newSpace = await this.createAutoSpace(tenantId, text, owner || 'system');
      return {
        spaceId: newSpace.id,
        confidence: 0.6, // Moderate confidence for auto-created
        needsReview: true,
        autoCreated: true,
      };
    }

    // Fallback
    return {
      spaceId: FALLBACK_SPACE_ID,
      confidence: 0.0,
      needsReview: true,
      autoCreated: false,
    };
  }

  private findCatalogMatch(text: string): { spaceId: string; confidence: number } | null {
    const lowerText = text.toLowerCase();
    let bestMatch: { spaceId: string; confidence: number } | null = null;

    for (const [spaceId, keywords] of Object.entries(this.CATALOG_KEYWORDS)) {
      const matches = keywords.filter(keyword => lowerText.includes(keyword)).length;
      if (matches >= this.MIN_KEYWORD_MATCHES) {
        const confidence = Math.min(matches / keywords.length, 1.0);
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { spaceId, confidence };
        }
      }
    }

    return bestMatch;
  }

  private canAutoCreate(text: string, source?: string): boolean {
    // Only auto-create from trusted sources
    if (!source || !this.TRUSTED_SOURCES.includes(source)) {
      return false;
    }

    // Simple heuristic: if text has multiple keywords from different domains
    const lowerText = text.toLowerCase();
    const matchedSpaces = Object.keys(this.CATALOG_KEYWORDS).filter(spaceId =>
      this.CATALOG_KEYWORDS[spaceId].some(keyword => lowerText.includes(keyword))
    );

    return matchedSpaces.length >= 1; // Emerging theme
  }

  private async createAutoSpace(tenantId: string, text: string, owner: string): Promise<Space> {
    // Generate space ID from text (simple heuristic)
    const words = text.toLowerCase().split(/\s+/).slice(0, 3);
    const spaceId = words.join('-').replace(/[^a-z0-9-]/g, '');

    const space: Space = {
      id: spaceId,
      name: `Auto: ${words.join(' ')}`,
      description: `Auto-created space for content about ${words.join(' ')}`,
      owner,
      status: 'hidden',
      authorityScore: 0.5,
      autoCreated: true,
    };

    await this.registryService.addSpace(tenantId, space);
    return space;
  }
}