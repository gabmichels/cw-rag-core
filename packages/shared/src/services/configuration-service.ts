/**
 * Centralized Configuration Service
 * Manages hybrid local/Firebase configurations and tenant settings
 */

import { environmentDetector, EnvironmentContext } from './environment-detector.js';
import {
  TenantFirebaseConfig,
  FirebaseRegion,
  TenantTier,
  createTenantFirebaseConfig,
  validateFirebaseConfig
} from '../config/firebase-config.js';

export interface TenantConfiguration {
  // Core tenant info
  tenantId: string;
  name: string;
  tier: TenantTier;
  status: 'active' | 'inactive' | 'suspended';

  // Environment configuration
  environment: EnvironmentContext;

  // Firebase configuration (if enabled)
  firebase?: TenantFirebaseConfig;

  // Local configuration (if local mode)
  local?: {
    apiPort: number;
    webPort: number;
    qdrantPort: number;
    embeddingsPort: number;
    containerPrefix: string;
  };

  // Feature flags
  features: {
    hybridSearch: boolean;
    reranking: boolean;
    streaming: boolean;
    analytics: boolean;
    multiLanguage: boolean;
  };

  // Performance and limits
  limits: {
    maxDocuments: number;
    maxStorageGB: number;
    rateLimitPerMinute: number;
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
  };

  // Security settings
  security: {
    allowAnonymous: boolean;
    enableCors: boolean;
    allowedOrigins: string[];
    enableRateLimit: boolean;
    enableAuditLogging: boolean;
  };

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export class ConfigurationService {
  private static _instance: ConfigurationService;
  private _configCache: Map<string, TenantConfiguration> = new Map();
  private _environmentContext: EnvironmentContext;

  static getInstance(): ConfigurationService {
    if (!this._instance) {
      this._instance = new ConfigurationService();
    }
    return this._instance;
  }

  constructor() {
    this._environmentContext = environmentDetector.getEnvironmentContext();
  }

  /**
   * Gets the complete configuration for a tenant
   */
  async getTenantConfiguration(tenantId: string): Promise<TenantConfiguration> {
    // Check cache first
    const cached = this._configCache.get(tenantId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Load configuration from appropriate source
    const config = this._environmentContext.isFirebase
      ? await this.loadFirebaseConfiguration(tenantId)
      : await this.loadLocalConfiguration(tenantId);

    // Cache for 10 minutes
    this._configCache.set(tenantId, config);
    setTimeout(() => {
      this._configCache.delete(tenantId);
    }, 10 * 60 * 1000);

    return config;
  }

  /**
   * Creates a new tenant configuration
   */
  async createTenantConfiguration(
    tenantId: string,
    name: string,
    tier: TenantTier = 'basic',
    region: FirebaseRegion = 'europe-west3'
  ): Promise<TenantConfiguration> {
    const environment = environmentDetector.getEnvironmentContext(tenantId);
    const now = new Date().toISOString();

    const config: TenantConfiguration = {
      tenantId,
      name,
      tier,
      status: 'active',
      environment,
      features: this.getDefaultFeatures(tier),
      limits: this.getDefaultLimits(tier),
      security: this.getDefaultSecurity(tier, environment.isLocal),
      createdAt: now,
      updatedAt: now,
    };

    // Add environment-specific configuration
    if (environment.isFirebase) {
      config.firebase = await this.createFirebaseConfig(tenantId, tier, region);
    } else {
      config.local = await this.createLocalConfig(tenantId);
    }

    // Validate configuration
    const validation = this.validateConfiguration(config);
    if (!validation.isValid) {
      throw new Error(`Invalid tenant configuration: ${validation.errors.join(', ')}`);
    }

    // Save configuration
    await this.saveConfiguration(config);

    return config;
  }

  /**
   * Updates an existing tenant configuration
   */
  async updateTenantConfiguration(
    tenantId: string,
    updates: Partial<TenantConfiguration>
  ): Promise<TenantConfiguration> {
    const existing = await this.getTenantConfiguration(tenantId);

    const updated: TenantConfiguration = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated configuration
    const validation = this.validateConfiguration(updated);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration update: ${validation.errors.join(', ')}`);
    }

    // Save and cache
    await this.saveConfiguration(updated);
    this._configCache.set(tenantId, updated);

    return updated;
  }

  /**
   * Gets the appropriate database configuration
   */
  getDatabaseConfig(tenantId: string): {
    type: 'qdrant' | 'firestore';
    url: string;
    collection: string;
    options: Record<string, any>;
  } {
    const environment = environmentDetector.getEnvironmentContext(tenantId);

    if (environment.isFirebase) {
      const firebaseConfig = environmentDetector.getTenantFirebaseConfig(tenantId);
      return {
        type: 'firestore',
        url: `firestore://${firebaseConfig?.projectId}`,
        collection: 'documents',
        options: {
          projectId: firebaseConfig?.projectId,
          region: environment.region,
          enableOffline: false,
        },
      };
    }

    return {
      type: 'qdrant',
      url: environmentDetector.getDatabaseUrl(),
      collection: process.env.QDRANT_COLLECTION || 'docs_v1',
      options: {
        apiKey: process.env.QDRANT_API_KEY,
        timeout: 30000,
      },
    };
  }

  /**
   * Gets the appropriate authentication configuration
   */
  getAuthConfig(tenantId: string): {
    type: 'token' | 'firebase';
    options: Record<string, any>;
  } {
    const environment = environmentDetector.getEnvironmentContext(tenantId);

    if (environment.isFirebase) {
      const firebaseConfig = environmentDetector.getTenantFirebaseConfig(tenantId);
      return {
        type: 'firebase',
        options: {
          projectId: firebaseConfig?.projectId,
          enableAnonymous: firebaseConfig?.security.allowAnonymous ?? true,
          sessionTimeout: firebaseConfig?.security.sessionTimeoutMinutes ?? 60,
        },
      };
    }

    return {
      type: 'token',
      options: {
        token: process.env.INGEST_TOKEN,
        headerName: 'x-ingest-token',
      },
    };
  }

  /**
   * Gets CORS configuration for the tenant
   */
  getCorsConfig(tenantId: string): {
    origins: string[];
    credentials: boolean;
    methods: string[];
    headers: string[];
  } {
    const environment = environmentDetector.getEnvironmentContext(tenantId);

    if (environment.isLocal) {
      return {
        origins: [
          'http://localhost:3001',
          'http://localhost:3000',
          'http://localhost:5678',
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'x-ingest-token', 'x-tenant'],
      };
    }

    // Firebase/production origins
    const firebaseConfig = environmentDetector.getTenantFirebaseConfig(tenantId);
    return {
      origins: [
        `https://${firebaseConfig?.projectId}.web.app`,
        `https://${firebaseConfig?.projectId}.firebaseapp.com`,
        firebaseConfig?.authDomain ? `https://${firebaseConfig.authDomain}` : '',
      ].filter(Boolean),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'x-tenant'],
    };
  }

  /**
   * Validates a tenant configuration
   */
  private validateConfiguration(config: TenantConfiguration): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!config.tenantId || config.tenantId.length < 3) {
      errors.push('Tenant ID must be at least 3 characters');
    }

    if (!config.name || config.name.length < 1) {
      errors.push('Tenant name is required');
    }

    // Firebase-specific validation
    if (config.firebase) {
      if (!validateFirebaseConfig(config.firebase)) {
        errors.push('Invalid Firebase configuration');
      }
    }

    // Local-specific validation
    if (config.local) {
      if (config.local.apiPort < 1000 || config.local.apiPort > 65535) {
        errors.push('Invalid API port number');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Loads configuration from Firebase (Firestore)
   */
  private async loadFirebaseConfiguration(tenantId: string): Promise<TenantConfiguration> {
    // TODO: Implement Firestore loading
    // For now, create a default configuration
    return this.createDefaultConfiguration(tenantId);
  }

  /**
   * Loads configuration from local registry
   */
  private async loadLocalConfiguration(tenantId: string): Promise<TenantConfiguration> {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        // Browser environment - return default configuration
        return this.createDefaultConfiguration(tenantId);
      }

      // Load from tenants/registry.json (Node.js only)
      const fs = await import('fs');
      const path = await import('path');

      const registryPath = path.join(process.cwd(), 'tenants', 'registry.json');
      if (!fs.existsSync(registryPath)) {
        return this.createDefaultConfiguration(tenantId);
      }

      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      const tenant = registry.tenants?.find((t: any) => t.id === tenantId);

      if (!tenant) {
        return this.createDefaultConfiguration(tenantId);
      }

      // Convert registry format to TenantConfiguration
      return this.convertRegistryToConfig(tenant);
    } catch (error) {
      console.warn(`Failed to load local configuration for ${tenantId}:`, error);
      return this.createDefaultConfiguration(tenantId);
    }
  }

  /**
   * Creates a default configuration for a tenant
   */
  private createDefaultConfiguration(tenantId: string): TenantConfiguration {
    const environment = environmentDetector.getEnvironmentContext(tenantId);
    const tier = environment.tier;
    const now = new Date().toISOString();

    return {
      tenantId,
      name: tenantId.charAt(0).toUpperCase() + tenantId.slice(1),
      tier,
      status: 'active',
      environment,
      features: this.getDefaultFeatures(tier),
      limits: this.getDefaultLimits(tier),
      security: this.getDefaultSecurity(tier, environment.isLocal),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Converts registry format to TenantConfiguration
   */
  private convertRegistryToConfig(registryTenant: any): TenantConfiguration {
    const environment = environmentDetector.getEnvironmentContext(registryTenant.id);

    return {
      tenantId: registryTenant.id,
      name: registryTenant.name || registryTenant.id,
      tier: registryTenant.tier || 'development',
      status: registryTenant.status || 'active',
      environment,
      local: registryTenant.configuration ? {
        apiPort: registryTenant.configuration.ports?.api || 3000,
        webPort: registryTenant.configuration.ports?.web || 3001,
        qdrantPort: registryTenant.configuration.ports?.qdrant || 6333,
        embeddingsPort: registryTenant.configuration.ports?.embeddings || 8080,
        containerPrefix: `cw-rag-${registryTenant.id}`,
      } : undefined,
      features: this.getDefaultFeatures(registryTenant.tier || 'development'),
      limits: {
        maxDocuments: registryTenant.configuration?.limits?.maxDocuments || 100000,
        maxStorageGB: registryTenant.configuration?.limits?.storageQuotaGB || 50,
        rateLimitPerMinute: registryTenant.configuration?.limits?.rateLimitPerTenant || 1000,
        maxConcurrentRequests: 100,
        requestTimeoutMs: 45000,
      },
      security: this.getDefaultSecurity(registryTenant.tier || 'development', true),
      createdAt: registryTenant.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Gets default features for a tier
   */
  private getDefaultFeatures(tier: TenantTier): TenantConfiguration['features'] {
    const features = {
      development: {
        hybridSearch: true,
        reranking: false,
        streaming: true,
        analytics: false,
        multiLanguage: false,
      },
      basic: {
        hybridSearch: true,
        reranking: true,
        streaming: true,
        analytics: true,
        multiLanguage: false,
      },
      premium: {
        hybridSearch: true,
        reranking: true,
        streaming: true,
        analytics: true,
        multiLanguage: true,
      },
      enterprise: {
        hybridSearch: true,
        reranking: true,
        streaming: true,
        analytics: true,
        multiLanguage: true,
      },
    };

    return features[tier];
  }

  /**
   * Gets default limits for a tier
   */
  private getDefaultLimits(tier: TenantTier): TenantConfiguration['limits'] {
    const limits = {
      development: {
        maxDocuments: 100000,
        maxStorageGB: 5,
        rateLimitPerMinute: 30,
        maxConcurrentRequests: 10,
        requestTimeoutMs: 45000,
      },
      basic: {
        maxDocuments: 1000000,
        maxStorageGB: 50,
        rateLimitPerMinute: 100,
        maxConcurrentRequests: 50,
        requestTimeoutMs: 45000,
      },
      premium: {
        maxDocuments: 10000000,
        maxStorageGB: 500,
        rateLimitPerMinute: 1000,
        maxConcurrentRequests: 200,
        requestTimeoutMs: 60000,
      },
      enterprise: {
        maxDocuments: -1,
        maxStorageGB: -1,
        rateLimitPerMinute: -1,
        maxConcurrentRequests: 1000,
        requestTimeoutMs: 120000,
      },
    };

    return limits[tier];
  }

  /**
   * Gets default security settings for a tier
   */
  private getDefaultSecurity(tier: TenantTier, isLocal: boolean): TenantConfiguration['security'] {
    return {
      allowAnonymous: tier === 'development' || tier === 'basic',
      enableCors: true,
      allowedOrigins: isLocal
        ? ['http://localhost:3001', 'http://localhost:3000']
        : ['https://*.firebaseapp.com', 'https://*.web.app'],
      enableRateLimit: !isLocal,
      enableAuditLogging: tier !== 'development',
    };
  }

  /**
   * Creates Firebase configuration for a tenant
   */
  private async createFirebaseConfig(
    tenantId: string,
    tier: TenantTier,
    region: FirebaseRegion
  ): Promise<TenantFirebaseConfig> {
    const projectId = `rag-${tenantId}-${Math.random().toString(36).substr(2, 6)}`;
    return createTenantFirebaseConfig(tenantId, projectId, tier, region);
  }

  /**
   * Creates local configuration for a tenant
   */
  private async createLocalConfig(tenantId: string): Promise<TenantConfiguration['local']> {
    // Generate unique ports for the tenant
    const basePort = 3000;
    const hash = this.simpleHash(tenantId);
    const portOffset = hash % 1000;

    return {
      apiPort: basePort + portOffset,
      webPort: basePort + portOffset + 1,
      qdrantPort: 6333 + portOffset,
      embeddingsPort: 8080 + portOffset,
      containerPrefix: `cw-rag-${tenantId}`,
    };
  }

  /**
   * Saves configuration to appropriate storage
   */
  private async saveConfiguration(config: TenantConfiguration): Promise<void> {
    if (config.environment.isFirebase) {
      // TODO: Save to Firestore
      console.log(`Would save Firebase config for ${config.tenantId}`);
    } else {
      // TODO: Save to local registry
      console.log(`Would save local config for ${config.tenantId}`);
    }
  }

  /**
   * Checks if cached configuration is still valid
   */
  private isCacheValid(config: TenantConfiguration): boolean {
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const age = Date.now() - new Date(config.updatedAt).getTime();
    return age < maxAge;
  }

  /**
   * Simple hash function for generating port offsets
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Clears the configuration cache
   */
  clearCache(): void {
    this._configCache.clear();
  }
}

// Export singleton instance
export const configurationService = ConfigurationService.getInstance();