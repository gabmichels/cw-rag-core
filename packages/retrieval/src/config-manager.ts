/**
 * Configuration management system for embedding services
 * Handles dynamic configuration loading, validation, and hot-reloading
 */

import {
  EmbeddingServiceConfig,
  EmbeddingEnvironmentConfig,
  DEFAULT_EMBEDDING_CONFIGS,
  loadConfigFromEnvironment,
  mergeConfigurations,
  validateEmbeddingConfig
} from './embedding-config.js';
import { EmbeddingServiceManager } from './embedding-manager.js';

export interface ConfigurationWatcher {
  startWatching(): void;
  stopWatching(): void;
  onConfigChange(callback: (newConfig: EmbeddingServiceConfig) => void): void;
}

export interface ConfigurationSource {
  loadConfig(): Promise<Partial<EmbeddingServiceConfig>>;
  watchForChanges(callback: (config: Partial<EmbeddingServiceConfig>) => void): void;
}

/**
 * Environment variable configuration source
 */
export class EnvironmentConfigurationSource implements ConfigurationSource {
  async loadConfig(): Promise<Partial<EmbeddingServiceConfig>> {
    const envConfig = loadConfigFromEnvironment();

    // Convert environment config to partial embedding service config
    const partialConfig: Partial<EmbeddingServiceConfig> = {};

    if (envConfig.provider) partialConfig.provider = envConfig.provider as any;
    if (envConfig.model) partialConfig.model = envConfig.model;
    if (envConfig.url) partialConfig.url = envConfig.url;

    if (envConfig.maxTokens || envConfig.dimensions) {
      partialConfig.capabilities = {
        maxTokens: envConfig.maxTokens || 512,
        maxBatchSize: 32,
        dimensions: envConfig.dimensions || 384,
        supportsBatching: true,
        supportsStreaming: false
      };
    }

    if (envConfig.chunkingStrategy || envConfig.overlapTokens || envConfig.safetyMargin) {
      partialConfig.chunking = {
        strategy: (envConfig.chunkingStrategy as any) || 'token-aware',
        maxTokens: envConfig.maxTokens ? Math.floor(envConfig.maxTokens * 0.9) : 460,
        overlapTokens: envConfig.overlapTokens || 50,
        minChunkTokens: 50,
        safetyMargin: envConfig.safetyMargin || 0.1,
        preserveBoundaries: true,
        fallbackStrategy: 'truncate'
      };
    }

    return partialConfig;
  }

  watchForChanges(callback: (config: Partial<EmbeddingServiceConfig>) => void): void {
    // Environment variables don't change at runtime in most environments
    // This is a no-op for environment source
    console.log('Environment configuration source does not support watching for changes');
  }
}

/**
 * File-based configuration source (for future use)
 */
export class FileConfigurationSource implements ConfigurationSource {
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  async loadConfig(): Promise<Partial<EmbeddingServiceConfig>> {
    try {
      // For now, return empty config
      // TODO: Implement file-based configuration loading
      console.log(`File configuration source not yet implemented for ${this.configPath}`);
      return {};
    } catch (error) {
      console.warn(`Failed to load configuration from file ${this.configPath}:`, error);
      return {};
    }
  }

  watchForChanges(callback: (config: Partial<EmbeddingServiceConfig>) => void): void {
    // TODO: Implement file watching using fs.watch or similar
    console.log('File configuration watching not yet implemented');
  }
}

/**
 * Centralized configuration manager
 */
export class EmbeddingConfigurationManager {
  private currentConfig: EmbeddingServiceConfig;
  private sources: ConfigurationSource[] = [];
  private watchers: ConfigurationWatcher[] = [];
  private changeCallbacks: ((config: EmbeddingServiceConfig) => void)[] = [];
  private embeddingManager?: EmbeddingServiceManager;

  constructor(initialConfig?: Partial<EmbeddingServiceConfig>) {
    // Add default environment source
    this.sources.push(new EnvironmentConfigurationSource());

    // Load initial configuration
    this.currentConfig = this.loadInitialConfiguration(initialConfig);

    console.log('StructuredLog:ConfigurationManagerInitialized', {
      provider: this.currentConfig.provider,
      model: this.currentConfig.model,
      sources: this.sources.length,
      hasValidConfig: true
    });
  }

  private loadInitialConfiguration(providedConfig?: Partial<EmbeddingServiceConfig>): EmbeddingServiceConfig {
    const envConfig = loadConfigFromEnvironment();
    const defaultConfigKey = envConfig.model || 'bge-small-en-v1.5';

    return mergeConfigurations(
      providedConfig || {},
      envConfig,
      defaultConfigKey
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbeddingServiceConfig {
    return { ...this.currentConfig };
  }

  /**
   * Update configuration and notify listeners
   */
  async updateConfig(newConfig: Partial<EmbeddingServiceConfig>): Promise<void> {
    const oldConfig = this.currentConfig;

    try {
      // Merge new configuration
      const envConfig = loadConfigFromEnvironment();
      this.currentConfig = mergeConfigurations(
        newConfig,
        envConfig,
        newConfig.model || oldConfig.model
      );

      // Validate merged configuration
      const validation = validateEmbeddingConfig(this.currentConfig);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      console.log('StructuredLog:ConfigurationUpdated', {
        oldProvider: oldConfig.provider,
        newProvider: this.currentConfig.provider,
        oldModel: oldConfig.model,
        newModel: this.currentConfig.model,
        changedFields: this.getChangedFields(oldConfig, this.currentConfig)
      });

      // Update embedding manager if exists
      if (this.embeddingManager) {
        this.embeddingManager.updateConfig(this.currentConfig);
      }

      // Notify listeners
      for (const callback of this.changeCallbacks) {
        try {
          callback(this.currentConfig);
        } catch (error) {
          console.error('Error in configuration change callback:', error);
        }
      }

    } catch (error) {
      // Rollback on error
      this.currentConfig = oldConfig;
      console.error('StructuredLog:ConfigurationUpdateFailed', {
        error: (error as Error).message,
        rolledBack: true
      });
      throw error;
    }
  }

  /**
   * Get or create embedding manager with current configuration
   */
  getEmbeddingManager(): EmbeddingServiceManager {
    if (!this.embeddingManager) {
      this.embeddingManager = new EmbeddingServiceManager(this.currentConfig);
    }
    return this.embeddingManager;
  }

  /**
   * Add configuration source
   */
  addConfigurationSource(source: ConfigurationSource): void {
    this.sources.push(source);

    // Set up watching for changes
    source.watchForChanges(async (partialConfig) => {
      try {
        await this.updateConfig(partialConfig);
      } catch (error) {
        console.error('Failed to apply configuration from source:', error);
      }
    });
  }

  /**
   * Subscribe to configuration changes
   */
  onConfigurationChange(callback: (config: EmbeddingServiceConfig) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Reload configuration from all sources
   */
  async reloadConfiguration(): Promise<void> {
    const mergedConfig: Partial<EmbeddingServiceConfig> = {};

    // Load from all sources and merge
    for (const source of this.sources) {
      try {
        const sourceConfig = await source.loadConfig();
        Object.assign(mergedConfig, sourceConfig);
      } catch (error) {
        console.warn('Failed to load configuration from source:', error);
      }
    }

    if (Object.keys(mergedConfig).length > 0) {
      await this.updateConfig(mergedConfig);
    }
  }

  /**
   * Get configuration health status
   */
  async getHealthStatus(): Promise<{
    configValid: boolean;
    embeddingServiceHealthy: boolean;
    lastConfigUpdate: string;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Validate current configuration
    const validation = validateEmbeddingConfig(this.currentConfig);
    if (!validation.valid) {
      errors.push(...validation.errors);
    }

    // Check embedding service health
    let embeddingServiceHealthy = false;
    try {
      if (this.embeddingManager) {
        const health = await this.embeddingManager.healthCheck();
        embeddingServiceHealthy = health.healthy;
        if (!health.healthy && health.error) {
          errors.push(`Embedding service unhealthy: ${health.error}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to check embedding service health: ${(error as Error).message}`);
    }

    return {
      configValid: validation.valid,
      embeddingServiceHealthy,
      lastConfigUpdate: new Date().toISOString(),
      errors
    };
  }

  /**
   * Get available configurations for different models
   */
  getAvailableConfigurations(): Record<string, Partial<EmbeddingServiceConfig>> {
    return { ...DEFAULT_EMBEDDING_CONFIGS };
  }

  /**
   * Switch to a different predefined configuration
   */
  async switchToConfiguration(configKey: string): Promise<void> {
    const availableConfigs = this.getAvailableConfigurations();
    const newConfig = availableConfigs[configKey];

    if (!newConfig) {
      throw new Error(`Configuration '${configKey}' not found. Available: ${Object.keys(availableConfigs).join(', ')}`);
    }

    await this.updateConfig(newConfig);
  }

  private getChangedFields(oldConfig: EmbeddingServiceConfig, newConfig: EmbeddingServiceConfig): string[] {
    const changes: string[] = [];

    if (oldConfig.provider !== newConfig.provider) changes.push('provider');
    if (oldConfig.model !== newConfig.model) changes.push('model');
    if (oldConfig.url !== newConfig.url) changes.push('url');
    if (oldConfig.capabilities.maxTokens !== newConfig.capabilities.maxTokens) changes.push('maxTokens');
    if (oldConfig.chunking.strategy !== newConfig.chunking.strategy) changes.push('chunkingStrategy');

    return changes;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.changeCallbacks = [];
    this.watchers.forEach(watcher => watcher.stopWatching());
    this.watchers = [];

    console.log('StructuredLog:ConfigurationManagerDestroyed');
  }
}

/**
 * Global configuration manager instance
 */
let globalConfigManager: EmbeddingConfigurationManager | null = null;

/**
 * Get or create global configuration manager
 */
export function getGlobalConfigurationManager(initialConfig?: Partial<EmbeddingServiceConfig>): EmbeddingConfigurationManager {
  if (!globalConfigManager) {
    globalConfigManager = new EmbeddingConfigurationManager(initialConfig);
  }
  return globalConfigManager;
}

/**
 * Reset global configuration manager (useful for testing)
 */
export function resetGlobalConfigurationManager(): void {
  if (globalConfigManager) {
    globalConfigManager.destroy();
    globalConfigManager = null;
  }
}