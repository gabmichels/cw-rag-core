import { ConfigurationService, TenantConfiguration } from '../services/configuration-service.js';
import { FirebaseRegion, TenantTier } from '../config/firebase-config.js';

// Mock the environmentDetector module
jest.mock('../services/environment-detector.js', () => ({
  environmentDetector: {
    getEnvironmentContext: jest.fn(),
    getTenantFirebaseConfig: jest.fn(),
    getDatabaseUrl: jest.fn(),
  },
}));

// Mock the firebase-config module
jest.mock('../config/firebase-config.js', () => ({
  ...jest.requireActual('../config/firebase-config.js'),
  validateFirebaseConfig: jest.fn().mockReturnValue(true),
}));

// Import the mocked environmentDetector
import { environmentDetector } from '../services/environment-detector.js';

describe('ConfigurationService', () => {
  let service: ConfigurationService;
  const testTenantId = 'test-tenant';

  beforeEach(() => {
    // Setup default mocks before creating service instance
    const mockEnv = {
      isLocal: true,
      isFirebase: false,
      isProduction: false,
      tenantId: testTenantId,
      region: 'europe-west3' as FirebaseRegion,
      tier: 'development' as TenantTier,
    };

    (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);
    (environmentDetector.getDatabaseUrl as jest.Mock).mockReturnValue('http://localhost:6333');
    (environmentDetector.getTenantFirebaseConfig as jest.Mock).mockReturnValue(null);

    // Clear singleton instance
    (ConfigurationService as any)._instance = null;
    service = ConfigurationService.getInstance();
  });

  afterEach(() => {
    service.clearCache();
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ConfigurationService.getInstance();
      const instance2 = ConfigurationService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getTenantConfiguration', () => {
    it('should return cached configuration if valid', async () => {
      const mockConfig: TenantConfiguration = {
        tenantId: testTenantId,
        name: 'Test Tenant',
        tier: 'basic',
        status: 'active',
        environment: {
          isLocal: true,
          isFirebase: false,
          isProduction: false,
          tenantId: testTenantId,
          region: 'europe-west3' as FirebaseRegion,
          tier: 'basic' as TenantTier,
        },
        features: { hybridSearch: true, reranking: true, streaming: true, analytics: true, multiLanguage: false },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, rateLimitPerMinute: 100, maxConcurrentRequests: 50, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock cache hit
      service['_configCache'].set(testTenantId, mockConfig);

      const result = await service.getTenantConfiguration(testTenantId);
      expect(result).toBe(mockConfig);
    });

    it('should load Firebase configuration when Firebase environment', async () => {
      const mockEnv = {
        isLocal: false,
        isFirebase: true,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'basic' as TenantTier,
      };

      // Update the environment context for the service
      (service as any)._environmentContext = mockEnv;
      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      // Mock loadFirebaseConfiguration
      const mockConfig: TenantConfiguration = {
        tenantId: testTenantId,
        name: 'Firebase Tenant',
        tier: 'basic',
        status: 'active',
        environment: mockEnv,
        firebase: {
          tenantId: testTenantId,
          projectId: 'test-project',
          region: 'europe-west3',
          tier: 'basic',
          authDomain: 'test.firebaseapp.com',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '',
          appId: '',
          features: { firestoreEnabled: true, authEnabled: true, storageEnabled: true, analyticsEnabled: false, hostingEnabled: true },
          limits: { maxDocuments: 1000000, maxStorageGB: 50, maxMonthlyReads: 10000000, maxMonthlyWrites: 1000000 },
          security: { allowAnonymous: true, requireEmailVerification: false, enableMfa: false, sessionTimeoutMinutes: 30 },
        },
        features: { hybridSearch: true, reranking: true, streaming: true, analytics: true, multiLanguage: false },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, rateLimitPerMinute: 100, maxConcurrentRequests: 50, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(service as any, 'loadFirebaseConfiguration').mockResolvedValue(mockConfig);

      const result = await service.getTenantConfiguration(testTenantId);
      expect(result).toBe(mockConfig);
      expect(service['_configCache'].has(testTenantId)).toBe(true);

    });

    it('should load local configuration when local environment', async () => {
      const mockEnv = {
        isLocal: true,
        isFirebase: false,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'development' as TenantTier,
      };

      // Update the environment context for the service
      (service as any)._environmentContext = mockEnv;
      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      const mockConfig: TenantConfiguration = {
        tenantId: testTenantId,
        name: 'Local Tenant',
        tier: 'development',
        status: 'active',
        environment: mockEnv as any,
        local: { apiPort: 3000, webPort: 3001, qdrantPort: 6333, embeddingsPort: 8080, containerPrefix: 'cw-rag-test-tenant' },
        features: { hybridSearch: true, reranking: false, streaming: true, analytics: false, multiLanguage: false },
        limits: { maxDocuments: 100000, maxStorageGB: 5, rateLimitPerMinute: 30, maxConcurrentRequests: 10, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(service as any, 'loadLocalConfiguration').mockResolvedValue(mockConfig);

      const result = await service.getTenantConfiguration(testTenantId);
      expect(result).toBe(mockConfig);

    });
  });

  describe('createTenantConfiguration', () => {
    it('should create new tenant configuration with Firebase setup', async () => {
      const mockEnv = {
        isLocal: false,
        isFirebase: true,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'basic' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      const mockFirebaseConfig = {
        tenantId: testTenantId,
        projectId: 'test-project',
        region: 'europe-west3',
        tier: 'basic',
        authDomain: 'test.firebaseapp.com',
        storageBucket: 'test.appspot.com',
        messagingSenderId: '',
        appId: '',
        features: { firestoreEnabled: true, authEnabled: true, storageEnabled: true, analyticsEnabled: false, hostingEnabled: true },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, maxMonthlyReads: 10000000, maxMonthlyWrites: 1000000 },
        security: { allowAnonymous: true, requireEmailVerification: false, enableMfa: false, sessionTimeoutMinutes: 30 },
      };

      jest.spyOn(service as any, 'createFirebaseConfig').mockResolvedValue(mockFirebaseConfig);
      jest.spyOn(service as any, 'saveConfiguration').mockResolvedValue(undefined);

      const result = await service.createTenantConfiguration(testTenantId, 'Test Tenant', 'basic', 'europe-west3');

      expect(result.tenantId).toBe(testTenantId);
      expect(result.name).toBe('Test Tenant');
      expect(result.tier).toBe('basic');
      expect(result.firebase).toEqual(mockFirebaseConfig);
      expect(result.local).toBeUndefined();
    });

    it('should create new tenant configuration with local setup', async () => {
      const mockEnv = {
        isLocal: true,
        isFirebase: false,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'development' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      jest.spyOn(service as any, 'createLocalConfig').mockResolvedValue({
        apiPort: 3000,
        webPort: 3001,
        qdrantPort: 6333,
        embeddingsPort: 8080,
        containerPrefix: 'cw-rag-test-tenant',
      });

      jest.spyOn(service as any, 'saveConfiguration').mockResolvedValue(undefined);

      const result = await service.createTenantConfiguration(testTenantId, 'Local Tenant', 'development');

      expect(result.tenantId).toBe(testTenantId);
      expect(result.local).toBeDefined();
      expect(result.firebase).toBeUndefined();
    });

    it('should throw error for invalid configuration', async () => {
      const mockEnv = {
        isLocal: true,
        isFirebase: false,
        isProduction: false,
        tenantId: '',
        region: 'europe-west3' as FirebaseRegion,
        tier: 'development' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      await expect(service.createTenantConfiguration('', 'Test')).rejects.toThrow('Invalid tenant configuration');
    });
  });

  describe('updateTenantConfiguration', () => {
    it('should update existing configuration', async () => {
      const baseTime = '2023-01-01T00:00:00.000Z';
      const existingConfig: TenantConfiguration = {
        tenantId: testTenantId,
        name: 'Old Name',
        tier: 'basic',
        status: 'active',
        environment: {
          isLocal: true,
          isFirebase: false,
          isProduction: false,
          tenantId: testTenantId,
          region: 'europe-west3' as FirebaseRegion,
          tier: 'basic' as TenantTier,
        },
        features: { hybridSearch: true, reranking: true, streaming: true, analytics: true, multiLanguage: false },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, rateLimitPerMinute: 100, maxConcurrentRequests: 50, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: true },
        createdAt: baseTime,
        updatedAt: baseTime,
      };

      jest.spyOn(service, 'getTenantConfiguration').mockResolvedValue(existingConfig);
      jest.spyOn(service as any, 'saveConfiguration').mockResolvedValue(undefined);

      // Mock Date.now to ensure different timestamp
      const originalNow = Date.now;
      Date.now = jest.fn(() => new Date('2023-01-02T00:00:00.000Z').getTime());

      const updates = { name: 'New Name', status: 'inactive' as const };
      const result = await service.updateTenantConfiguration(testTenantId, updates);

      expect(result.name).toBe('New Name');
      expect(result.status).toBe('inactive');
      expect(result.updatedAt).not.toBe(existingConfig.updatedAt);

      // Restore original Date.now
      Date.now = originalNow;
    });
  });

  describe('getDatabaseConfig', () => {
    it('should return Firestore config for Firebase environment', () => {
      const mockEnv = {
        isLocal: false,
        isFirebase: true,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'basic' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);
      (environmentDetector.getTenantFirebaseConfig as jest.Mock).mockReturnValue({
        projectId: 'test-project',
      });

      const config = service.getDatabaseConfig(testTenantId);

      expect(config.type).toBe('firestore');
      expect(config.url).toBe('firestore://test-project');
      expect(config.collection).toBe('documents');
    });

    it('should return Qdrant config for local environment', () => {
      const mockEnv = {
        isLocal: true,
        isFirebase: false,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'development' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);
      (environmentDetector.getDatabaseUrl as jest.Mock).mockReturnValue('http://localhost:6333');

      const config = service.getDatabaseConfig(testTenantId);

      expect(config.type).toBe('qdrant');
      expect(config.url).toBe('http://localhost:6333');
      expect(config.collection).toBe('docs_v1');
    });
  });

  describe('getAuthConfig', () => {
    it('should return Firebase auth config for Firebase environment', () => {
      const mockEnv = {
        isLocal: false,
        isFirebase: true,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'basic' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);
      (environmentDetector.getTenantFirebaseConfig as jest.Mock).mockReturnValue({
        projectId: 'test-project',
        security: { allowAnonymous: true, sessionTimeoutMinutes: 60 },
      });

      const config = service.getAuthConfig(testTenantId);

      expect(config.type).toBe('firebase');
      expect(config.options.projectId).toBe('test-project');
    });

    it('should return token auth config for local environment', () => {
      const mockEnv = {
        isLocal: true,
        isFirebase: false,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'development' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      // Mock process.env
      const originalEnv = process.env;
      process.env = { ...originalEnv, INGEST_TOKEN: 'test-token' };

      const config = service.getAuthConfig(testTenantId);

      expect(config.type).toBe('token');
      expect(config.options.token).toBe('test-token');

      process.env = originalEnv;
    });
  });

  describe('getCorsConfig', () => {
    it('should return local CORS config for local environment', () => {
      const mockEnv = {
        isLocal: true,
        isFirebase: false,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'development' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);

      const config = service.getCorsConfig(testTenantId);

      expect(config.origins).toContain('http://localhost:3001');
      expect(config.credentials).toBe(true);
      expect(config.methods).toContain('GET');
    });

    it('should return Firebase CORS config for Firebase environment', () => {
      const mockEnv = {
        isLocal: false,
        isFirebase: true,
        isProduction: false,
        tenantId: testTenantId,
        region: 'europe-west3' as FirebaseRegion,
        tier: 'basic' as TenantTier,
      };

      (environmentDetector.getEnvironmentContext as jest.Mock).mockReturnValue(mockEnv);
      (environmentDetector.getTenantFirebaseConfig as jest.Mock).mockReturnValue({
        projectId: 'test-project',
        authDomain: 'test.firebaseapp.com',
      });

      const config = service.getCorsConfig(testTenantId);

      expect(config.origins).toContain('https://test-project.web.app');
      expect(config.credentials).toBe(true);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate correct configuration', () => {
      const config: TenantConfiguration = {
        tenantId: 'valid-tenant',
        name: 'Valid Tenant',
        tier: 'basic',
        status: 'active',
        environment: {
          isLocal: true,
          isFirebase: false,
          isProduction: false,
          tenantId: 'valid-tenant',
          region: 'europe-west3',
          tier: 'basic',
        },
        features: { hybridSearch: true, reranking: true, streaming: true, analytics: true, multiLanguage: false },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, rateLimitPerMinute: 100, maxConcurrentRequests: 50, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = (service as any).validateConfiguration(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid tenant ID', () => {
      const config: TenantConfiguration = {
        tenantId: 'x',
        name: 'Test',
        tier: 'basic',
        status: 'active',
        environment: {
          isLocal: true,
          isFirebase: false,
          isProduction: false,
          tenantId: 'x',
          region: 'europe-west3',
          tier: 'basic',
        },
        features: { hybridSearch: true, reranking: true, streaming: true, analytics: true, multiLanguage: false },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, rateLimitPerMinute: 100, maxConcurrentRequests: 50, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = (service as any).validateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tenant ID must be at least 3 characters');
    });

    it('should reject invalid local port', () => {
      const config: TenantConfiguration = {
        tenantId: 'test-tenant',
        name: 'Test',
        tier: 'basic',
        status: 'active',
        environment: {
          isLocal: true,
          isFirebase: false,
          isProduction: false,
          tenantId: 'test-tenant',
          region: 'europe-west3',
          tier: 'basic',
        },
        local: { apiPort: 80, webPort: 3001, qdrantPort: 6333, embeddingsPort: 8080, containerPrefix: 'test' },
        features: { hybridSearch: true, reranking: true, streaming: true, analytics: true, multiLanguage: false },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, rateLimitPerMinute: 100, maxConcurrentRequests: 50, requestTimeoutMs: 45000 },
        security: { allowAnonymous: true, enableCors: true, allowedOrigins: [], enableRateLimit: false, enableAuditLogging: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = (service as any).validateConfiguration(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid API port number');
    });
  });

  describe('clearCache', () => {
    it('should clear configuration cache', () => {
      service['_configCache'].set('test', {} as TenantConfiguration);
      expect(service['_configCache'].size).toBe(1);

      service.clearCache();
      expect(service['_configCache'].size).toBe(0);
    });
  });
});