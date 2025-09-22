import {
  TenantGuardrailConfig,
  AnswerabilityThreshold,
  ANSWERABILITY_THRESHOLDS,
  DEFAULT_GUARDRAIL_CONFIG
} from '../types/guardrail.js';

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
  createCustomThreshold(
    name: string,
    threshold: Omit<AnswerabilityThreshold, 'type'>
  ): AnswerabilityThreshold;
}

export class GuardrailConfigServiceImpl implements GuardrailConfigService {
  private tenantConfigs = new Map<string, TenantGuardrailConfig>();
  private configChangeListeners: Array<(config: TenantGuardrailConfig) => void> = [];

  constructor() {
    this.initializeDefaultConfigs();
  }

  async getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig> {
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

  async updateTenantConfig(config: TenantGuardrailConfig): Promise<void> {
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

  async getAllTenantConfigs(): Promise<TenantGuardrailConfig[]> {
    return Array.from(this.tenantConfigs.values()).map(config => ({ ...config }));
  }

  async resetTenantConfig(tenantId: string): Promise<void> {
    const defaultConfig = {
      ...DEFAULT_GUARDRAIL_CONFIG,
      tenantId
    };

    this.tenantConfigs.set(tenantId, defaultConfig);
    this.notifyConfigChange(defaultConfig);
  }

  async validateConfig(config: TenantGuardrailConfig): Promise<boolean> {
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
    } catch (error) {
      return false;
    }
  }

  getThresholdPresets(): Record<string, AnswerabilityThreshold> {
    return { ...ANSWERABILITY_THRESHOLDS };
  }

  createCustomThreshold(
    name: string,
    threshold: Omit<AnswerabilityThreshold, 'type'>
  ): AnswerabilityThreshold {
    return {
      ...threshold,
      type: 'custom'
    };
  }

  /**
   * Add listener for configuration changes
   */
  addConfigChangeListener(listener: (config: TenantGuardrailConfig) => void): void {
    this.configChangeListeners.push(listener);
  }

  /**
   * Remove configuration change listener
   */
  removeConfigChangeListener(listener: (config: TenantGuardrailConfig) => void): void {
    const index = this.configChangeListeners.indexOf(listener);
    if (index > -1) {
      this.configChangeListeners.splice(index, 1);
    }
  }

  private validateThreshold(threshold: AnswerabilityThreshold): boolean {
    return (
      threshold.minConfidence >= 0 && threshold.minConfidence <= 1 &&
      threshold.minTopScore >= 0 && threshold.minTopScore <= 1 &&
      threshold.minMeanScore >= 0 && threshold.minMeanScore <= 1 &&
      threshold.maxStdDev >= 0 && threshold.maxStdDev <= 1 &&
      threshold.minResultCount >= 0 && threshold.minResultCount <= 100
    );
  }

  private initializeDefaultConfigs(): void {
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

  private notifyConfigChange(config: TenantGuardrailConfig): void {
    for (const listener of this.configChangeListeners) {
      try {
        listener(config);
      } catch (error) {
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
  private persistenceProvider?: ConfigPersistenceProvider;

  constructor(persistenceProvider?: ConfigPersistenceProvider) {
    super();
    this.persistenceProvider = persistenceProvider;
    this.loadPersistedConfigs();
  }

  async updateTenantConfig(config: TenantGuardrailConfig): Promise<void> {
    await super.updateTenantConfig(config);

    // Persist configuration if provider is available
    if (this.persistenceProvider) {
      try {
        await this.persistenceProvider.saveConfig(config);
      } catch (error) {
        console.error('Failed to persist guardrail config:', error);
        // Don't throw - keep in-memory config even if persistence fails
      }
    }
  }

  private async loadPersistedConfigs(): Promise<void> {
    if (!this.persistenceProvider) return;

    try {
      const configs = await this.persistenceProvider.loadAllConfigs();
      for (const config of configs) {
        await super.updateTenantConfig(config);
      }
    } catch (error) {
      console.error('Failed to load persisted guardrail configs:', error);
      // Continue with default configs
    }
  }
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
export class InMemoryConfigPersistence implements ConfigPersistenceProvider {
  private configs = new Map<string, TenantGuardrailConfig>();

  async saveConfig(config: TenantGuardrailConfig): Promise<void> {
    this.configs.set(config.tenantId, { ...config });
  }

  async loadConfig(tenantId: string): Promise<TenantGuardrailConfig | null> {
    const config = this.configs.get(tenantId);
    return config ? { ...config } : null;
  }

  async loadAllConfigs(): Promise<TenantGuardrailConfig[]> {
    return Array.from(this.configs.values()).map(config => ({ ...config }));
  }

  async deleteConfig(tenantId: string): Promise<void> {
    this.configs.delete(tenantId);
  }
}

/**
 * Factory function for creating config service
 */
export function createGuardrailConfigService(
  persistenceProvider?: ConfigPersistenceProvider
): GuardrailConfigService {
  return persistenceProvider ?
    new PersistentGuardrailConfigService(persistenceProvider) :
    new GuardrailConfigServiceImpl();
}