import { ExtractedFeatures } from './feature-extractor.js';
import { TenantPack, DomainPack, LanguagePack } from '../schemas/lexical.js';

export interface QueryDSL {
  filters: any[]; // Engine-specific filters
  scoring: any; // Boosts, etc.
  coverage: {
    minCore: number;
    policy: string;
  };
}

/**
 * Engine-agnostic query builder for lexical search.
 */
export class QueryBuilder {
  /**
   * Build query DSL from features and packs.
   */
  build(features: ExtractedFeatures, { tenantPack, languagePack, domainPack }: {
    tenantPack: TenantPack;
    languagePack: LanguagePack;
    domainPack: DomainPack;
  }): QueryDSL {
    const filters: any[] = [];
    const scoring: any = {};

    // CORE terms: must match
    if (features.core.length > 0) {
      filters.push({
        key: 'content',
        match: { any: features.core },
      });
    }

    // PHRASES: proximity search
    if (features.phrases.length > 0) {
      for (const phrase of features.phrases) {
        filters.push({
          key: 'content',
          match: { value: phrase },
        });
      }
    }

    // NUMBERS: exact match
    if (features.numbers.length > 0) {
      filters.push({
        key: 'content',
        match: { any: features.numbers },
      });
    }

    // SUPPORT: down-weight
    if (features.support.length > 0) {
      scoring.supportPenalty = features.support.length * 0.1;
    }

    // Field boosts from domain pack
    scoring.fieldBoosts = domainPack.fieldBoosts;

    // Coverage policy
    const coverage = this.getCoveragePolicy(features, domainPack);

    return {
      filters,
      scoring,
      coverage,
    };
  }

  private getCoveragePolicy(features: ExtractedFeatures, domainPack: DomainPack) {
    const coreCount = features.core.length;
    let minCore: number;
    let policy: string;

    if (coreCount <= 3) {
      policy = domainPack.coveragePolicy.short;
      minCore = policy === 'all' ? coreCount : parseInt(policy) || 0;
    } else if (coreCount <= 10) {
      policy = domainPack.coveragePolicy.medium;
      minCore = parseInt(policy) || 1;
    } else {
      policy = domainPack.coveragePolicy.long;
      minCore = policy.includes('%') ? Math.floor(coreCount * 0.5) : parseInt(policy) || 2;
    }

    return { minCore, policy };
  }
}