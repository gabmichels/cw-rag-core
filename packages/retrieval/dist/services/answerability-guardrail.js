import { DEFAULT_GUARDRAIL_CONFIG, DEFAULT_IDK_TEMPLATES } from '../types/guardrail.js';
export class AnswerabilityGuardrailServiceImpl {
    tenantConfigs = new Map();
    constructor() {
        this.initializeDefaultConfigs();
    }
    async evaluateAnswerability(query, results, userContext, metrics) {
        const startTime = performance.now();
        // Get tenant configuration
        const config = await this.getTenantConfig(userContext.tenantId || 'default');
        // Check if guardrail is enabled
        if (!config.enabled) {
            return {
                isAnswerable: true,
                score: this.createPassthroughScore(),
                threshold: config.threshold,
                auditTrail: this.createAuditTrail(query, userContext, results, 'GUARDRAIL_DISABLED', startTime)
            };
        }
        // Check bypass mode for admin users
        if (config.bypassEnabled && this.isAdminUser(userContext)) {
            return {
                isAnswerable: true,
                score: this.createPassthroughScore(),
                threshold: config.threshold,
                auditTrail: this.createAuditTrail(query, userContext, results, 'BYPASS_ENABLED', startTime)
            };
        }
        // Calculate answerability score
        const score = this.calculateAnswerabilityScore(results);
        // Apply threshold decision logic
        const isAnswerable = this.applyThresholdDecision(score, config.threshold);
        // Generate IDK response if not answerable
        const idkResponse = isAnswerable ? undefined : this.generateIdkResponse(score, config, results);
        const decision = {
            isAnswerable,
            score,
            threshold: config.threshold,
            idkResponse,
            auditTrail: this.createAuditTrail(query, userContext, results, isAnswerable ? 'ANSWERABLE' : 'NOT_ANSWERABLE', startTime)
        };
        return decision;
    }
    calculateAnswerabilityScore(results, rerankerResults) {
        const startTime = performance.now();
        if (results.length === 0) {
            return {
                confidence: 0,
                scoreStats: this.createEmptyStats(),
                algorithmScores: {
                    statistical: 0,
                    threshold: 0,
                    mlFeatures: 0,
                    rerankerConfidence: 0
                },
                isAnswerable: false,
                reasoning: 'No retrieval results found',
                computationTime: performance.now() - startTime
            };
        }
        // Extract scores for analysis
        const scores = results.map(r => r.fusionScore || r.score || 0);
        const vectorScores = results.map(r => r.vectorScore || 0).filter(s => s > 0);
        const keywordScores = results.map(r => r.keywordScore || 0).filter(s => s > 0);
        const rerankerScores = rerankerResults?.map(r => r.rerankerScore) || [];
        // Calculate score statistics
        const scoreStats = this.calculateScoreStatistics(scores);
        // Calculate algorithm-specific scores
        const algorithmScores = {
            statistical: this.calculateStatisticalScore(scoreStats),
            threshold: this.calculateThresholdScore(scores),
            mlFeatures: this.calculateMLFeaturesScore(scoreStats, vectorScores, keywordScores),
            rerankerConfidence: rerankerScores.length > 0 ?
                this.calculateRerankerConfidenceScore(rerankerScores) : undefined
        };
        // Calculate ensemble confidence score
        const confidence = this.calculateEnsembleConfidence(algorithmScores);
        return {
            confidence,
            scoreStats,
            algorithmScores,
            isAnswerable: confidence > 0.5, // Default threshold, will be overridden by tenant config
            reasoning: this.generateScoreReasoning(scoreStats, algorithmScores),
            computationTime: performance.now() - startTime
        };
    }
    async getTenantConfig(tenantId) {
        const config = this.tenantConfigs.get(tenantId);
        if (!config) {
            return this.getDefaultConfig(tenantId);
        }
        return config;
    }
    async updateTenantConfig(config) {
        this.tenantConfigs.set(config.tenantId, config);
    }
    generateIdkResponse(score, config, results) {
        // Determine appropriate template based on score characteristics
        const template = this.selectIdkTemplate(score, config);
        // Generate suggestions if enabled
        const suggestions = template.includeSuggestions ?
            this.generateFallbackSuggestions(results, config.fallbackConfig) : undefined;
        return {
            message: template.template,
            reasonCode: template.reasonCode,
            suggestions,
            confidenceLevel: score.confidence
        };
    }
    calculateScoreStatistics(scores) {
        if (scores.length === 0) {
            return this.createEmptyStats();
        }
        const sortedScores = [...scores].sort((a, b) => a - b);
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        return {
            mean,
            max: Math.max(...scores),
            min: Math.min(...scores),
            stdDev,
            count: scores.length,
            percentiles: {
                p25: this.calculatePercentile(sortedScores, 0.25),
                p50: this.calculatePercentile(sortedScores, 0.50),
                p75: this.calculatePercentile(sortedScores, 0.75),
                p90: this.calculatePercentile(sortedScores, 0.90)
            }
        };
    }
    calculateStatisticalScore(stats) {
        if (stats.count === 0)
            return 0;
        // Statistical confidence based on score distribution
        const meanWeight = 0.4;
        const maxWeight = 0.3;
        const consistencyWeight = 0.3;
        // Normalize mean and max scores
        const normalizedMean = Math.min(stats.mean, 1.0);
        const normalizedMax = Math.min(stats.max, 1.0);
        // Consistency score (lower std dev = higher consistency = higher confidence)
        const consistencyScore = stats.stdDev > 0 ? Math.max(0, 1 - (stats.stdDev / 0.5)) : 1.0;
        return (normalizedMean * meanWeight) +
            (normalizedMax * maxWeight) +
            (consistencyScore * consistencyWeight);
    }
    calculateThresholdScore(scores) {
        if (scores.length === 0)
            return 0;
        // Simple threshold-based scoring
        const topScore = Math.max(...scores);
        const aboveThreshold = scores.filter(s => s > 0.5).length;
        const ratioAboveThreshold = aboveThreshold / scores.length;
        return Math.min(topScore * 0.7 + ratioAboveThreshold * 0.3, 1.0);
    }
    calculateMLFeaturesScore(stats, vectorScores, keywordScores) {
        if (stats.count === 0)
            return 0;
        // ML-ready feature scoring
        const features = {
            scoreRange: stats.max - stats.min,
            scoreVariance: stats.stdDev,
            topScoreRatio: stats.max / (stats.mean + 0.001), // Avoid division by zero
            vectorKeywordAlignment: this.calculateVectorKeywordAlignment(vectorScores, keywordScores),
            resultDensity: Math.min(stats.count / 10, 1.0) // Normalize count to 0-1
        };
        // Weighted combination of features
        return Math.min((features.scoreRange * 0.2) +
            ((1 - Math.min(features.scoreVariance, 1.0)) * 0.3) +
            (Math.min(features.topScoreRatio / 2, 1.0) * 0.3) +
            (features.vectorKeywordAlignment * 0.1) +
            (features.resultDensity * 0.1), 1.0);
    }
    calculateRerankerConfidenceScore(rerankerScores) {
        if (rerankerScores.length === 0)
            return 0;
        const topRerankerScore = Math.max(...rerankerScores);
        const meanRerankerScore = rerankerScores.reduce((sum, s) => sum + s, 0) / rerankerScores.length;
        // Reranker confidence based on top score and mean
        return Math.min(topRerankerScore * 0.6 + meanRerankerScore * 0.4, 1.0);
    }
    calculateVectorKeywordAlignment(vectorScores, keywordScores) {
        if (vectorScores.length === 0 || keywordScores.length === 0)
            return 0.5;
        // Calculate correlation between vector and keyword scores
        const minLength = Math.min(vectorScores.length, keywordScores.length);
        const vector = vectorScores.slice(0, minLength);
        const keyword = keywordScores.slice(0, minLength);
        if (minLength === 0)
            return 0.5;
        const vectorMean = vector.reduce((sum, s) => sum + s, 0) / vector.length;
        const keywordMean = keyword.reduce((sum, s) => sum + s, 0) / keyword.length;
        let correlation = 0;
        let vectorVar = 0;
        let keywordVar = 0;
        for (let i = 0; i < minLength; i++) {
            const vectorDiff = vector[i] - vectorMean;
            const keywordDiff = keyword[i] - keywordMean;
            correlation += vectorDiff * keywordDiff;
            vectorVar += vectorDiff * vectorDiff;
            keywordVar += keywordDiff * keywordDiff;
        }
        const denominator = Math.sqrt(vectorVar * keywordVar);
        if (denominator === 0)
            return 0.5;
        // Convert correlation (-1 to 1) to confidence score (0 to 1)
        return (correlation / denominator + 1) / 2;
    }
    calculateEnsembleConfidence(algorithmScores) {
        // Use default weights if not specified
        const weights = {
            statistical: 0.4,
            threshold: 0.3,
            mlFeatures: 0.2,
            rerankerConfidence: 0.1
        };
        let totalWeight = weights.statistical + weights.threshold + weights.mlFeatures;
        let confidence = (algorithmScores.statistical * weights.statistical) +
            (algorithmScores.threshold * weights.threshold) +
            (algorithmScores.mlFeatures * weights.mlFeatures);
        // Add reranker confidence if available
        if (algorithmScores.rerankerConfidence !== undefined) {
            confidence += algorithmScores.rerankerConfidence * weights.rerankerConfidence;
            totalWeight += weights.rerankerConfidence;
        }
        return confidence / totalWeight;
    }
    applyThresholdDecision(score, threshold) {
        // Multiple criteria must be met for answerability
        const checks = [
            score.confidence >= threshold.minConfidence,
            score.scoreStats.max >= threshold.minTopScore,
            score.scoreStats.mean >= threshold.minMeanScore,
            score.scoreStats.stdDev <= threshold.maxStdDev,
            score.scoreStats.count >= threshold.minResultCount
        ];
        return checks.every(check => check);
    }
    selectIdkTemplate(score, config) {
        const templates = config.idkTemplates || DEFAULT_IDK_TEMPLATES;
        // Select template based on failure reason
        if (score.scoreStats.count === 0) {
            return templates.find(t => t.reasonCode === 'NO_RELEVANT_DOCS') || templates[0];
        }
        if (score.confidence < 0.3) {
            return templates.find(t => t.reasonCode === 'LOW_CONFIDENCE') || templates[0];
        }
        if (score.scoreStats.stdDev > 0.4) {
            return templates.find(t => t.reasonCode === 'AMBIGUOUS_QUERY') || templates[0];
        }
        // Default to low confidence template
        return templates.find(t => t.reasonCode === 'LOW_CONFIDENCE') || templates[0];
    }
    generateFallbackSuggestions(results, fallbackConfig) {
        if (!fallbackConfig?.enabled || results.length === 0) {
            return [];
        }
        const maxSuggestions = fallbackConfig.maxSuggestions || 3;
        const threshold = fallbackConfig.suggestionThreshold || 0.3;
        // Filter results above suggestion threshold and extract meaningful suggestions
        const candidateResults = results
            .filter(r => (r.fusionScore || r.score || 0) >= threshold)
            .slice(0, maxSuggestions);
        return candidateResults.map(result => {
            // Extract potential suggestion from document content
            const content = result.content || '';
            const firstSentence = content.split('.')[0]?.trim();
            if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
                return `Try asking about: "${firstSentence}..."`;
            }
            // Fallback to generic suggestion
            return `Consider refining your query to be more specific`;
        }).filter((suggestion, index, arr) => arr.indexOf(suggestion) === index); // Remove duplicates
    }
    createAuditTrail(query, userContext, results, decision, startTime) {
        const endTime = performance.now();
        return {
            timestamp: new Date().toISOString(),
            query,
            tenantId: userContext.tenantId || 'default',
            userContext: JSON.stringify({
                id: userContext.id,
                tenantId: userContext.tenantId,
                groupIds: userContext.groupIds
            }),
            retrievalResultsCount: results.length,
            scoreStatsSummary: results.length > 0 ?
                `mean=${results.reduce((sum, r) => sum + (r.fusionScore || r.score || 0), 0) / results.length}` :
                'no_results',
            decisionRationale: decision,
            performanceMetrics: {
                scoringDuration: endTime - startTime,
                totalDuration: endTime - startTime
            }
        };
    }
    calculatePercentile(sortedScores, percentile) {
        if (sortedScores.length === 0)
            return 0;
        const index = percentile * (sortedScores.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) {
            return sortedScores[lower];
        }
        const weight = index - lower;
        return sortedScores[lower] * (1 - weight) + sortedScores[upper] * weight;
    }
    createEmptyStats() {
        return {
            mean: 0,
            max: 0,
            min: 0,
            stdDev: 0,
            count: 0,
            percentiles: { p25: 0, p50: 0, p75: 0, p90: 0 }
        };
    }
    createPassthroughScore() {
        return {
            confidence: 1.0,
            scoreStats: this.createEmptyStats(),
            algorithmScores: {
                statistical: 1.0,
                threshold: 1.0,
                mlFeatures: 1.0,
                rerankerConfidence: 1.0
            },
            isAnswerable: true,
            reasoning: 'Guardrail disabled or bypassed',
            computationTime: 0
        };
    }
    isAdminUser(userContext) {
        // Check if user has admin privileges
        return userContext.groupIds?.includes('admin') ||
            userContext.groupIds?.includes('system') ||
            userContext.id?.includes('admin');
    }
    generateScoreReasoning(stats, algorithms) {
        const reasons = [];
        if (stats.count === 0) {
            reasons.push('No retrieval results');
        }
        else {
            if (stats.mean < 0.3)
                reasons.push('Low mean score');
            if (stats.max < 0.5)
                reasons.push('Low maximum score');
            if (stats.stdDev > 0.4)
                reasons.push('High score variance');
            if (algorithms.statistical < 0.5)
                reasons.push('Poor statistical confidence');
        }
        return reasons.length > 0 ? reasons.join(', ') : 'Sufficient confidence in results';
    }
    initializeDefaultConfigs() {
        this.tenantConfigs.set('default', DEFAULT_GUARDRAIL_CONFIG);
    }
    getDefaultConfig(tenantId) {
        return {
            ...DEFAULT_GUARDRAIL_CONFIG,
            tenantId
        };
    }
}
// Factory function for creating guardrail service
export function createAnswerabilityGuardrailService() {
    return new AnswerabilityGuardrailServiceImpl();
}
// Performance-optimized guardrail service with caching
export class CachedAnswerabilityGuardrailService extends AnswerabilityGuardrailServiceImpl {
    configCache = new Map();
    CONFIG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    async getTenantConfig(tenantId) {
        // Check cache first
        const cached = this.configCache.get(tenantId);
        if (cached && Date.now() - cached.timestamp < this.CONFIG_CACHE_TTL) {
            return cached.config;
        }
        // Get fresh config
        const config = await super.getTenantConfig(tenantId);
        // Cache the result
        this.configCache.set(tenantId, {
            config,
            timestamp: Date.now()
        });
        return config;
    }
    async updateTenantConfig(config) {
        await super.updateTenantConfig(config);
        // Invalidate cache
        this.configCache.delete(config.tenantId);
    }
}
