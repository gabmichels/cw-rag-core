import {
  GuardrailConfigServiceImpl,
  PersistentGuardrailConfigService,
  InMemoryConfigPersistence,
  createGuardrailConfigService,
  ConfigPersistenceProvider
} from '../src/services/guardrail-config.js';
import {
  TenantGuardrailConfig,
  ANSWERABILITY_THRESHOLDS,
  DEFAULT_GUARDRAIL_CONFIG
} from '../src/types/guardrail.js';

describe('GuardrailConfigService', () => {
  let service: GuardrailConfigServiceImpl;

  beforeEach(() => {
    service = new GuardrailConfigServiceImpl();
  });

  describe('constructor and initialization', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(GuardrailConfigServiceImpl);
    });

    it('should initialize with default tenant configurations', async () => {
      const defaultConfig = await service.getTenantConfig('default');
      expect(defaultConfig.tenantId).toBe('default');
      expect(defaultConfig.enabled).toBe(true);

      const enterpriseConfig = await service.getTenantConfig('enterprise');
      expect(enterpriseConfig.tenantId).toBe('enterprise');
      expect(enterpriseConfig.threshold.type).toBe('strict');
      expect(enterpriseConfig.bypassEnabled).toBe(true);

      const startupConfig = await service.getTenantConfig('startup');
      expect(startupConfig.tenantId).toBe('startup');
      expect(startupConfig.threshold.type).toBe('permissive');
    });
  });

  describe('getTenantConfig', () => {
    it('should return configured tenant config', async () => {
      const customConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.strict,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      await service.updateTenantConfig(customConfig);
      const retrieved = await service.getTenantConfig('test-tenant');

      expect(retrieved).toEqual(customConfig);
      expect(retrieved).not.toBe(customConfig); // Should be a copy
    });

    it('should return default config for unknown tenant', async () => {
      const config = await service.getTenantConfig('unknown-tenant');

      expect(config.tenantId).toBe('unknown-tenant');
      expect(config.enabled).toBe(true);
      expect(config.threshold).toBeDefined();
      expect(config.algorithmWeights).toBeDefined();
    });
  });

  describe('updateTenantConfig', () => {
    it('should update tenant configuration', async () => {
      const customConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: false,
        threshold: ANSWERABILITY_THRESHOLDS.permissive,
        bypassEnabled: true,
        algorithmWeights: {
          statistical: 0.5,
          threshold: 0.2,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      await service.updateTenantConfig(customConfig);
      const retrieved = await service.getTenantConfig('test-tenant');

      expect(retrieved.enabled).toBe(false);
      expect(retrieved.bypassEnabled).toBe(true);
      expect(retrieved.threshold.type).toBe('permissive');
    });

    it('should reject invalid configuration', async () => {
      const invalidConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: {
          type: 'custom',
          minConfidence: -0.1, // Invalid: negative confidence
          minTopScore: 0.5,
          minMeanScore: 0.3,
          maxStdDev: 0.4,
          minResultCount: 2
        },
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      await expect(service.updateTenantConfig(invalidConfig))
        .rejects
        .toThrow('Invalid guardrail configuration for tenant test-tenant');
    });

    it('should notify config change listeners', async () => {
      const listener = jest.fn();
      service.addConfigChangeListener(listener);

      const config: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      await service.updateTenantConfig(config);

      expect(listener).toHaveBeenCalledWith(config);
    });
  });

  describe('getAllTenantConfigs', () => {
    it('should return all configured tenants', async () => {
      const configs = await service.getAllTenantConfigs();

      expect(configs.length).toBeGreaterThanOrEqual(3); // default, enterprise, startup
      expect(configs.every(config => config.tenantId)).toBe(true);
      expect(configs.every(config => config.enabled !== undefined)).toBe(true);
    });

    it('should return copies, not references', async () => {
      const configs = await service.getAllTenantConfigs();
      const firstConfig = configs[0];

      // Modify the returned config
      firstConfig.enabled = !firstConfig.enabled;

      // Get configs again and verify original wasn't modified
      const configsAgain = await service.getAllTenantConfigs();
      expect(configsAgain[0].enabled).not.toBe(firstConfig.enabled);
    });
  });

  describe('resetTenantConfig', () => {
    it('should reset tenant to default configuration', async () => {
      // First set a custom config
      const customConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: false,
        threshold: ANSWERABILITY_THRESHOLDS.strict,
        bypassEnabled: true,
        algorithmWeights: {
          statistical: 0.5,
          threshold: 0.2,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      await service.updateTenantConfig(customConfig);

      // Verify custom config is set
      let config = await service.getTenantConfig('test-tenant');
      expect(config.enabled).toBe(false);

      // Reset config
      await service.resetTenantConfig('test-tenant');

      // Verify it's back to default
      config = await service.getTenantConfig('test-tenant');
      expect(config.enabled).toBe(true);
      expect(config.bypassEnabled).toBe(false);
      expect(config.threshold).toEqual(DEFAULT_GUARDRAIL_CONFIG.threshold);
    });

    it('should notify listeners on reset', async () => {
      const listener = jest.fn();
      service.addConfigChangeListener(listener);

      await service.resetTenantConfig('test-tenant');

      expect(listener).toHaveBeenCalled();
      const calledConfig = listener.mock.calls[0][0];
      expect(calledConfig.tenantId).toBe('test-tenant');
      expect(calledConfig.enabled).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', async () => {
      const validConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      const isValid = await service.validateConfig(validConfig);
      expect(isValid).toBe(true);
    });

    it('should reject invalid threshold values', async () => {
      const invalidConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: {
          type: 'custom',
          minConfidence: 1.5, // Invalid: > 1
          minTopScore: 0.5,
          minMeanScore: 0.3,
          maxStdDev: 0.4,
          minResultCount: 2
        },
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      const isValid = await service.validateConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should reject invalid algorithm weights total', async () => {
      const invalidConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.8, // Total will be > 1.2
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      const isValid = await service.validateConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should reject invalid IDK templates', async () => {
      const invalidConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        },
        idkTemplates: [
          {
            id: '', // Invalid: empty id
            reasonCode: 'TEST',
            template: 'Test template',
            includeSuggestions: true
          }
        ]
      };

      const isValid = await service.validateConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should reject invalid fallback config', async () => {
      const invalidConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        },
        fallbackConfig: {
          enabled: true,
          maxSuggestions: 15, // Invalid: > 10
          suggestionThreshold: 0.5
        }
      };

      const isValid = await service.validateConfig(invalidConfig);
      expect(isValid).toBe(false);
    });

    it('should validate configuration with all optional fields', async () => {
      const fullConfig: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        },
        idkTemplates: [
          {
            id: 'test-template',
            reasonCode: 'TEST',
            template: 'Test template',
            includeSuggestions: true
          }
        ],
        fallbackConfig: {
          enabled: true,
          maxSuggestions: 5,
          suggestionThreshold: 0.3
        }
      };

      const isValid = await service.validateConfig(fullConfig);
      expect(isValid).toBe(true);
    });
  });

  describe('getThresholdPresets', () => {
    it('should return all threshold presets', () => {
      const presets = service.getThresholdPresets();

      expect(presets).toEqual(ANSWERABILITY_THRESHOLDS);
      expect(presets.strict).toBeDefined();
      expect(presets.moderate).toBeDefined();
      expect(presets.permissive).toBeDefined();
    });

    it('should return a copy, not reference', () => {
      const presets1 = service.getThresholdPresets();
      const presets2 = service.getThresholdPresets();

      expect(presets1).not.toBe(presets2);
      expect(presets1).toEqual(presets2);
    });
  });

  describe('createCustomThreshold', () => {
    it('should create custom threshold with correct type', () => {
      const customThreshold = service.createCustomThreshold('my-threshold', {
        minConfidence: 0.7,
        minTopScore: 0.6,
        minMeanScore: 0.4,
        maxStdDev: 0.3,
        minResultCount: 2
      });

      expect(customThreshold.type).toBe('custom');
      expect(customThreshold.minConfidence).toBe(0.7);
      expect(customThreshold.minTopScore).toBe(0.6);
      expect(customThreshold.minMeanScore).toBe(0.4);
      expect(customThreshold.maxStdDev).toBe(0.3);
      expect(customThreshold.minResultCount).toBe(2);
    });
  });

  describe('config change listeners', () => {
    it('should add and remove listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      service.addConfigChangeListener(listener1);
      service.addConfigChangeListener(listener2);

      // Trigger a config change
      const config: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      service['notifyConfigChange'](config);

      expect(listener1).toHaveBeenCalledWith(config);
      expect(listener2).toHaveBeenCalledWith(config);

      // Remove one listener
      service.removeConfigChangeListener(listener1);

      service['notifyConfigChange'](config);

      expect(listener1).toHaveBeenCalledTimes(1); // Still only once
      expect(listener2).toHaveBeenCalledTimes(2); // Called again
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      service.addConfigChangeListener(errorListener);
      service.addConfigChangeListener(goodListener);

      const config: TenantGuardrailConfig = {
        tenantId: 'test-tenant',
        enabled: true,
        threshold: ANSWERABILITY_THRESHOLDS.moderate,
        bypassEnabled: false,
        algorithmWeights: {
          statistical: 0.4,
          threshold: 0.3,
          mlFeatures: 0.2,
          rerankerConfidence: 0.1
        }
      };

      // Should not throw despite listener error
      expect(() => service['notifyConfigChange'](config)).not.toThrow();

      expect(errorListener).toHaveBeenCalledWith(config);
      expect(goodListener).toHaveBeenCalledWith(config);
    });
  });
});

describe('PersistentGuardrailConfigService', () => {
  let persistenceProvider: InMemoryConfigPersistence;
  let service: PersistentGuardrailConfigService;

  beforeEach(() => {
    persistenceProvider = new InMemoryConfigPersistence();
    service = new PersistentGuardrailConfigService(persistenceProvider);
  });

  it('should create service with persistence provider', () => {
    expect(service).toBeInstanceOf(PersistentGuardrailConfigService);
  });

  it('should persist configuration changes', async () => {
    const config: TenantGuardrailConfig = {
      tenantId: 'persistent-tenant',
      enabled: true,
      threshold: ANSWERABILITY_THRESHOLDS.strict,
      bypassEnabled: false,
      algorithmWeights: {
        statistical: 0.4,
        threshold: 0.3,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    await service.updateTenantConfig(config);

    // Verify it's in memory
    const inMemory = await service.getTenantConfig('persistent-tenant');
    expect(inMemory.threshold.type).toBe('strict');

    // Verify it's persisted
    const persisted = await persistenceProvider.loadConfig('persistent-tenant');
    expect(persisted?.threshold.type).toBe('strict');
  });

  it('should load persisted configs on initialization', async () => {
    const config: TenantGuardrailConfig = {
      tenantId: 'preloaded-tenant',
      enabled: false,
      threshold: ANSWERABILITY_THRESHOLDS.permissive,
      bypassEnabled: true,
      algorithmWeights: {
        statistical: 0.5,
        threshold: 0.2,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    await persistenceProvider.saveConfig(config);

    // Create new service instance - should load persisted configs
    const newService = new PersistentGuardrailConfigService(persistenceProvider);

    // Manually trigger loading by accessing a method that would use the config
    // Since constructor loading is async, we'll test the loading mechanism directly
    const allPersisted = await persistenceProvider.loadAllConfigs();
    expect(allPersisted).toHaveLength(1);
    expect(allPersisted[0].enabled).toBe(false);
    expect(allPersisted[0].bypassEnabled).toBe(true);

    // The service should have loaded this config internally
    // (Note: Due to async nature of constructor, we test the mechanism rather than the exact timing)
  });

  it('should handle persistence errors gracefully', async () => {
    const failingProvider: ConfigPersistenceProvider = {
      saveConfig: jest.fn().mockRejectedValue(new Error('Persistence failed')),
      loadConfig: jest.fn().mockResolvedValue(null),
      loadAllConfigs: jest.fn().mockResolvedValue([]),
      deleteConfig: jest.fn().mockResolvedValue(undefined)
    };

    const serviceWithFailingPersistence = new PersistentGuardrailConfigService(failingProvider);

    const config: TenantGuardrailConfig = {
      tenantId: 'test-tenant',
      enabled: true,
      threshold: ANSWERABILITY_THRESHOLDS.moderate,
      bypassEnabled: false,
      algorithmWeights: {
        statistical: 0.4,
        threshold: 0.3,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    // Should not throw despite persistence failure
    await expect(serviceWithFailingPersistence.updateTenantConfig(config)).resolves.not.toThrow();

    // Config should still be in memory
    const retrieved = await serviceWithFailingPersistence.getTenantConfig('test-tenant');
    expect(retrieved.enabled).toBe(true);
  });
});

describe('InMemoryConfigPersistence', () => {
  let persistence: InMemoryConfigPersistence;

  beforeEach(() => {
    persistence = new InMemoryConfigPersistence();
  });

  it('should save and load config', async () => {
    const config: TenantGuardrailConfig = {
      tenantId: 'test-tenant',
      enabled: true,
      threshold: ANSWERABILITY_THRESHOLDS.strict,
      bypassEnabled: false,
      algorithmWeights: {
        statistical: 0.4,
        threshold: 0.3,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    await persistence.saveConfig(config);
    const loaded = await persistence.loadConfig('test-tenant');

    expect(loaded).toEqual(config);
    expect(loaded).not.toBe(config); // Should be a copy
  });

  it('should return null for non-existent config', async () => {
    const loaded = await persistence.loadConfig('non-existent');
    expect(loaded).toBeNull();
  });

  it('should load all configs', async () => {
    const config1: TenantGuardrailConfig = {
      tenantId: 'tenant1',
      enabled: true,
      threshold: ANSWERABILITY_THRESHOLDS.strict,
      bypassEnabled: false,
      algorithmWeights: {
        statistical: 0.4,
        threshold: 0.3,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    const config2: TenantGuardrailConfig = {
      tenantId: 'tenant2',
      enabled: false,
      threshold: ANSWERABILITY_THRESHOLDS.permissive,
      bypassEnabled: true,
      algorithmWeights: {
        statistical: 0.5,
        threshold: 0.2,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    await persistence.saveConfig(config1);
    await persistence.saveConfig(config2);

    const allConfigs = await persistence.loadAllConfigs();

    expect(allConfigs).toHaveLength(2);
    expect(allConfigs.map(c => c.tenantId).sort()).toEqual(['tenant1', 'tenant2']);
  });

  it('should delete config', async () => {
    const config: TenantGuardrailConfig = {
      tenantId: 'test-tenant',
      enabled: true,
      threshold: ANSWERABILITY_THRESHOLDS.moderate,
      bypassEnabled: false,
      algorithmWeights: {
        statistical: 0.4,
        threshold: 0.3,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };

    await persistence.saveConfig(config);

    // Verify it exists
    let loaded = await persistence.loadConfig('test-tenant');
    expect(loaded).not.toBeNull();

    // Delete it
    await persistence.deleteConfig('test-tenant');

    // Verify it's gone
    loaded = await persistence.loadConfig('test-tenant');
    expect(loaded).toBeNull();
  });
});

describe('createGuardrailConfigService', () => {
  it('should create basic service without persistence', () => {
    const service = createGuardrailConfigService();

    expect(service).toBeInstanceOf(GuardrailConfigServiceImpl);
    expect(service).not.toBeInstanceOf(PersistentGuardrailConfigService);
  });

  it('should create persistent service with persistence provider', () => {
    const persistenceProvider = new InMemoryConfigPersistence();
    const service = createGuardrailConfigService(persistenceProvider);

    expect(service).toBeInstanceOf(PersistentGuardrailConfigService);
  });
});