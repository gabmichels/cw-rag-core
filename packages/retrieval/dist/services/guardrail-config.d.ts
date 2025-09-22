import { TenantGuardrailConfig, AnswerabilityThreshold } from '../types/guardrail.js';
export interface GuardrailConfigService {
    /**
     * Get guardrail configuration for a specific tenant
     */
    getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    /**
     * Update guardrail configuration for a tenant
     */
    updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;
    /**
     * Get all configured tenants
     */
    getAllTenantConfigs(): Promise<TenantGuardrailConfig[]>;
    /**
     * Reset tenant configuration to defaults
     */
    resetTenantConfig(tenantId: string): Promise<void>;
    /**
     * Validate configuration before saving
     */
    validateConfig(config: TenantGuardrailConfig): Promise<boolean>;
    /**
     * Get available threshold presets
     */
    getThresholdPresets(): Record<string, AnswerabilityThreshold>;
    /**
     * Create custom threshold configuration
     */
    createCustomThreshold(name: string, threshold: Omit<AnswerabilityThreshold, 'type'>): AnswerabilityThreshold;
}
export declare class GuardrailConfigServiceImpl implements GuardrailConfigService {
    private tenantConfigs;
    private configChangeListeners;
    constructor();
    getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;
    getAllTenantConfigs(): Promise<TenantGuardrailConfig[]>;
    resetTenantConfig(tenantId: string): Promise<void>;
    validateConfig(config: TenantGuardrailConfig): Promise<boolean>;
    getThresholdPresets(): Record<string, AnswerabilityThreshold>;
    createCustomThreshold(name: string, threshold: Omit<AnswerabilityThreshold, 'type'>): AnswerabilityThreshold;
    /**
     * Add listener for configuration changes
     */
    addConfigChangeListener(listener: (config: TenantGuardrailConfig) => void): void;
    /**
     * Remove configuration change listener
     */
    removeConfigChangeListener(listener: (config: TenantGuardrailConfig) => void): void;
    private validateThreshold;
    private initializeDefaultConfigs;
    private notifyConfigChange;
}
/**
 * Advanced configuration service with persistence support
 */
export declare class PersistentGuardrailConfigService extends GuardrailConfigServiceImpl {
    private persistenceProvider?;
    constructor(persistenceProvider?: ConfigPersistenceProvider);
    updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;
    private loadPersistedConfigs;
}
/**
 * Interface for configuration persistence
 */
export interface ConfigPersistenceProvider {
    saveConfig(config: TenantGuardrailConfig): Promise<void>;
    loadConfig(tenantId: string): Promise<TenantGuardrailConfig | null>;
    loadAllConfigs(): Promise<TenantGuardrailConfig[]>;
    deleteConfig(tenantId: string): Promise<void>;
}
/**
 * In-memory configuration persistence (for testing)
 */
export declare class InMemoryConfigPersistence implements ConfigPersistenceProvider {
    private configs;
    saveConfig(config: TenantGuardrailConfig): Promise<void>;
    loadConfig(tenantId: string): Promise<TenantGuardrailConfig | null>;
    loadAllConfigs(): Promise<TenantGuardrailConfig[]>;
    deleteConfig(tenantId: string): Promise<void>;
}
/**
 * Factory function for creating config service
 */
export declare function createGuardrailConfigService(persistenceProvider?: ConfigPersistenceProvider): GuardrailConfigService;
