import { HybridSearchResult, KeywordSearchResult, RrfConfig, SearchPerformanceMetrics } from '../types/hybrid.js';
import { VectorSearchResult } from '../types/vector.js';
export interface RrfFusionService {
    fuseResults(vectorResults: VectorSearchResult[], keywordResults: KeywordSearchResult[], config: RrfConfig): HybridSearchResult[];
}
export declare class ReciprocalRankFusionService implements RrfFusionService {
    fuseResults(vectorResults: VectorSearchResult[], keywordResults: KeywordSearchResult[], config: RrfConfig): HybridSearchResult[];
    private extractContent;
}
export declare class NormalizedRrfFusionService implements RrfFusionService {
    fuseResults(vectorResults: VectorSearchResult[], keywordResults: KeywordSearchResult[], config: RrfConfig): HybridSearchResult[];
    private normalizeScores;
}
export declare class RrfPerformanceMonitor {
    static measureFusion<T>(fusionFn: () => T, vectorCount: number, keywordCount: number): {
        result: T;
        metrics: Partial<SearchPerformanceMetrics>;
    };
}
