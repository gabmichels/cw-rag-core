import { ANSWERABILITY_THRESHOLDS, DEFAULT_GUARDRAIL_CONFIG } from '../types/guardrail.js';
export class GuardrailConfigServiceImpl {
    tenantConfigs = new Map();
    configChangeListeners = [];
    constructor() {
        this.initializeDefaultConfigs();
    }
    async getTenantConfig(tenantId) {
        const config = this.tenantConfigs.get(tenantId);
        if (!config) {
            // Return default config with tenant ID
            return {
                ...DEFAULT_GUARDRAIL_CONFIG,
                tenantId
            };
        }
        return { ...config }; // Return copy to prevent mutations
    }
    async updateTenantConfig(config) {
        // Validate configuration
        const isValid = await this.validateConfig(config);
        if (!isValid) {
            throw new Error(`Invalid guardrail configuration for tenant ${config.tenantId}`);
        }
        // Store configuration
        this.tenantConfigs.set(config.tenantId, { ...config });
        // Notify listeners of configuration change
        this.notifyConfigChange(config);
    }
    async getAllTenantConfigs() {
        return Array.from(this.tenantConfigs.values()).map(config => ({ ...config }));
    }
    async resetTenantConfig(tenantId) {
        const defaultConfig = {
            ...DEFAULT_GUARDRAIL_CONFIG,
            tenantId
        };
        this.tenantConfigs.set(tenantId, defaultConfig);
        this.notifyConfigChange(defaultConfig);
    }
    async validateConfig(config) {
        try {
            // Validate threshold configuration
            if (!this.validateThreshold(config.threshold)) {
                return false;
            }
            // Validate algorithm weights sum to reasonable range
            const weights = config.algorithmWeights;
            const totalWeight = weights.statistical + weights.threshold + weights.mlFeatures + weights.rerankerConfidence;
            if (totalWeight < 0.8 || totalWeight > 1.2) {
                return false;
            }
            // Validate IDK templates
            if (config.idkTemplates) {
                for (const template of config.idkTemplates) {
                    if (!template.id || !template.reasonCode || !template.template) {
                        return false;
                    }
                }
            }
            // Validate fallback configuration
            if (config.fallbackConfig) {
                const fallback = config.fallbackConfig;
                if (fallback.maxSuggestions < 0 || fallback.maxSuggestions > 10) {
                    return false;
                }
                if (fallback.suggestionThreshold < 0 || fallback.suggestionThreshold > 1) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    getThresholdPresets() {
        return { ...ANSWERABILITY_THRESHOLDS };
    }
    createCustomThreshold(name, threshold) {
        return {
            ...threshold,
            type: 'custom'
        };
    }
    /**
     * Add listener for configuration changes
     */
    addConfigChangeListener(listener) {
        this.configChangeListeners.push(listener);
    }
    /**
     * Remove configuration change listener
     */
    removeConfigChangeListener(listener) {
        const index = this.configChangeListeners.indexOf(listener);
        if (index > -1) {
            this.configChangeListeners.splice(index, 1);
        }
    }
    validateThreshold(threshold) {
        return (threshold.minConfidence >= 0 && threshold.minConfidence <= 1 &&
            threshold.minTopScore >= 0 && threshold.minTopScore <= 1 &&
            threshold.minMeanScore >= 0 && threshold.minMeanScore <= 1 &&
            threshold.maxStdDev >= 0 && threshold.maxStdDev <= 1 &&
            threshold.minResultCount >= 0 && threshold.minResultCount <= 100);
    }
    initializeDefaultConfigs() {
        // Initialize some common tenant configurations
        const configs = [
            { ...DEFAULT_GUARDRAIL_CONFIG, tenantId: 'default' },
            {
                ...DEFAULT_GUARDRAIL_CONFIG,
                tenantId: 'enterprise',
                threshold: ANSWERABILITY_THRESHOLDS.strict,
                bypassEnabled: true
            },
            {
                ...DEFAULT_GUARDRAIL_CONFIG,
                tenantId: 'startup',
                threshold: ANSWERABILITY_THRESHOLDS.permissive
            }
        ];
        for (const config of configs) {
            this.tenantConfigs.set(config.tenantId, config);
        }
    }
    notifyConfigChange(config) {
        for (const listener of this.configChangeListeners) {
            try {
                listener(config);
            }
            catch (error) {
                // Log error but don't break other listeners
                console.error('Error in config change listener:', error);
            }
        }
    }
}
/**
 * Advanced configuration service with persistence support
 */
export class PersistentGuardrailConfigService extends GuardrailConfigServiceImpl {
    persistenceProvider;
    constructor(persistenceProvider) {
        super();
        this.persistenceProvider = persistenceProvider;
        this.loadPersistedConfigs();
    }
    async updateTenantConfig(config) {
        await super.updateTenantConfig(config);
        // Persist configuration if provider is available
        if (this.persistenceProvider) {
            try {
                await this.persistenceProvider.saveConfig(config);
            }
            catch (error) {
                console.error('Failed to persist guardrail config:', error);
                // Don't throw - keep in-memory config even if persistence fails
            }
        }
    }
    async loadPersistedConfigs() {
        if (!this.persistenceProvider)
            return;
        try {
            const configs = await this.persistenceProvider.loadAllConfigs();
            for (const config of configs) {
                await super.updateTenantConfig(config);
            }
        }
        catch (error) {
            console.error('Failed to load persisted guardrail configs:', error);
            // Continue with default configs
        }
    }
}
/**
 * In-memory configuration persistence (for testing)
 */
export class InMemoryConfigPersistence {
    configs = new Map();
    async saveConfig(config) {
        this.configs.set(config.tenantId, { ...config });
    }
    async loadConfig(tenantId) {
        const config = this.configs.get(tenantId);
        return config ? { ...config } : null;
    }
    async loadAllConfigs() {
        return Array.from(this.configs.values()).map(config => ({ ...config }));
    }
    async deleteConfig(tenantId) {
        this.configs.delete(tenantId);
    }
}
/**
 * Factory function for creating config service
 */
export function createGuardrailConfigService(persistenceProvider) {
    return persistenceProvider ?
        new PersistentGuardrailConfigService(persistenceProvider) :
        new GuardrailConfigServiceImpl();
}
