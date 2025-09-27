import { EnvironmentDetector, environmentDetector } from '../services/environment-detector.js';

// Mock process.env
const originalEnv = process.env;

describe('EnvironmentDetector', () => {
  let detector: EnvironmentDetector;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Clear singleton instance
    (EnvironmentDetector as any)._instance = null;
    detector = EnvironmentDetector.getInstance();
    detector.clearCache();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = EnvironmentDetector.getInstance();
      const instance2 = EnvironmentDetector.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('static methods', () => {
    describe('isFirebaseEnabled', () => {
      it('should return true when FIREBASE_PROJECT_ID is set', () => {
        process.env.FIREBASE_PROJECT_ID = 'test-project';
        expect(EnvironmentDetector.isFirebaseEnabled()).toBe(true);
      });

      it('should return true when NEXT_PUBLIC_FIREBASE_PROJECT_ID is set', () => {
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
        expect(EnvironmentDetector.isFirebaseEnabled()).toBe(true);
      });

      it('should return true when GOOGLE_APPLICATION_CREDENTIALS is set', () => {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/creds.json';
        expect(EnvironmentDetector.isFirebaseEnabled()).toBe(true);
      });

      it('should return false when no Firebase config is set', () => {
        delete process.env.FIREBASE_PROJECT_ID;
        delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        expect(EnvironmentDetector.isFirebaseEnabled()).toBe(false);
      });
    });

    describe('isLocal', () => {
      it('should return true for local development', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.FIREBASE_PROJECT_ID;
        expect(EnvironmentDetector.isLocal()).toBe(true);
      });

      it('should return true when QDRANT_URL contains localhost', () => {
        process.env.NODE_ENV = 'production';
        process.env.QDRANT_URL = 'http://localhost:6333';
        delete process.env.FIREBASE_PROJECT_ID;
        expect(EnvironmentDetector.isLocal()).toBe(true);
      });

      it('should return true when QDRANT_URL contains qdrant:6333', () => {
        process.env.QDRANT_URL = 'http://qdrant:6333';
        expect(EnvironmentDetector.isLocal()).toBe(true);
      });

      it('should return false for Firebase production', () => {
        process.env.NODE_ENV = 'production';
        process.env.FIREBASE_PROJECT_ID = 'test';
        delete process.env.QDRANT_URL;
        expect(EnvironmentDetector.isLocal()).toBe(false);
      });
    });

    describe('isProduction', () => {
      it('should return true for production Firebase environment', () => {
        process.env.NODE_ENV = 'production';
        process.env.FIREBASE_PROJECT_ID = 'test';
        expect(EnvironmentDetector.isProduction()).toBe(true);
      });

      it('should return false for local environment', () => {
        process.env.NODE_ENV = 'development';
        expect(EnvironmentDetector.isProduction()).toBe(false);
      });

      it('should return false for production without Firebase', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.FIREBASE_PROJECT_ID;
        expect(EnvironmentDetector.isProduction()).toBe(false);
      });
    });

    describe('getCurrentTenantId', () => {
      it('should return TENANT environment variable', () => {
        process.env.TENANT = 'custom-tenant';
        expect(EnvironmentDetector.getCurrentTenantId()).toBe('custom-tenant');
      });

      it('should return NEXT_PUBLIC_TENANT_ID environment variable', () => {
        delete process.env.TENANT;
        process.env.NEXT_PUBLIC_TENANT_ID = 'public-tenant';
        expect(EnvironmentDetector.getCurrentTenantId()).toBe('public-tenant');
      });

      it('should return default when no tenant env vars', () => {
        delete process.env.TENANT;
        delete process.env.NEXT_PUBLIC_TENANT_ID;
        expect(EnvironmentDetector.getCurrentTenantId()).toBe('default');
      });
    });

    describe('getPreferredRegion', () => {
      it('should return europe-west3 as default', () => {
        delete process.env.FIREBASE_REGION;
        delete process.env.GCP_REGION;
        expect(EnvironmentDetector.getPreferredRegion()).toBe('europe-west3');
      });

      it('should return FIREBASE_REGION', () => {
        process.env.FIREBASE_REGION = 'us-central1';
        expect(EnvironmentDetector.getPreferredRegion()).toBe('us-central1');
      });

      it('should return GCP_REGION', () => {
        delete process.env.FIREBASE_REGION;
        process.env.GCP_REGION = 'asia-northeast1';
        expect(EnvironmentDetector.getPreferredRegion()).toBe('asia-northeast1');
      });

      it('should prioritize FIREBASE_REGION over GCP_REGION', () => {
        process.env.FIREBASE_REGION = 'europe-west1';
        process.env.GCP_REGION = 'us-central1';
        expect(EnvironmentDetector.getPreferredRegion()).toBe('europe-west1');
      });
    });

    describe('getTenantTier', () => {
      it('should return development for non-production', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.TENANT_TIER;
        expect(EnvironmentDetector.getTenantTier()).toBe('development');
      });

      it('should return basic for production', () => {
        process.env.NODE_ENV = 'production';
        process.env.FIREBASE_PROJECT_ID = 'test';
        delete process.env.TENANT_TIER;
        expect(EnvironmentDetector.getTenantTier()).toBe('basic');
      });

      it('should return TENANT_TIER value', () => {
        process.env.TENANT_TIER = 'premium';
        expect(EnvironmentDetector.getTenantTier()).toBe('premium');
      });

      it('should return development for invalid tier', () => {
        process.env.TENANT_TIER = 'invalid';
        process.env.NODE_ENV = 'development';
        expect(EnvironmentDetector.getTenantTier()).toBe('development');
      });
    });
  });

  describe('getEnvironmentContext', () => {
    it('should return cached context', () => {
      const context1 = detector.getEnvironmentContext('tenant1');
      const context2 = detector.getEnvironmentContext('tenant1');
      expect(context1).toBe(context2);
    });

    it('should return different contexts for different tenants', () => {
      const context1 = detector.getEnvironmentContext('tenant1');
      const context2 = detector.getEnvironmentContext('tenant2');
      expect(context1.tenantId).toBe('tenant1');
      expect(context2.tenantId).toBe('tenant2');
    });

    it('should use provided tenantId', () => {
      const context = detector.getEnvironmentContext('custom-tenant');
      expect(context.tenantId).toBe('custom-tenant');
    });

    it('should use default tenantId when none provided', () => {
      process.env.TENANT = 'env-tenant';
      const context = detector.getEnvironmentContext();
      expect(context.tenantId).toBe('env-tenant');
    });

    it('should detect Firebase environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      process.env.NODE_ENV = 'production';
      const context = detector.getEnvironmentContext('test-tenant');
      expect(context.isFirebase).toBe(true);
      expect(context.isProduction).toBe(true);
      expect(context.isLocal).toBe(false);
    });

    it('should detect local environment', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      process.env.NODE_ENV = 'development';
      const context = detector.getEnvironmentContext('test-tenant');
      expect(context.isLocal).toBe(true);
      expect(context.isFirebase).toBe(false);
      expect(context.isProduction).toBe(false);
    });
  });

  describe('getTenantFirebaseConfig', () => {
    it('should return null for non-Firebase environment', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      const config = detector.getTenantFirebaseConfig('test-tenant');
      expect(config).toBeNull();
    });

    it('should return null when projectId is missing', () => {
      process.env.FIREBASE_PROJECT_ID = '';
      const config = detector.getTenantFirebaseConfig('test-tenant');
      expect(config).toBeNull();
    });

    it('should return Firebase config for Firebase environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'test-app-id';
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'test-measurement';
      process.env.FIREBASE_REGION = 'us-central1';
      process.env.TENANT_TIER = 'premium';

      const config = detector.getTenantFirebaseConfig('test-tenant');

      expect(config).toEqual({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        region: 'us-central1',
        tier: 'premium',
        authDomain: 'test.firebaseapp.com',
        storageBucket: 'test.appspot.com',
        messagingSenderId: '',
        appId: 'test-app-id',
        measurementId: 'test-measurement',
        features: {
          firestoreEnabled: true,
          authEnabled: true,
          storageEnabled: true,
          analyticsEnabled: false,
          hostingEnabled: true,
        },
        limits: {
          maxDocuments: 10000000,
          maxStorageGB: 500,
          maxMonthlyReads: 100000000,
          maxMonthlyWrites: 10000000,
        },
        security: {
          allowAnonymous: false,
          requireEmailVerification: true,
          enableMfa: false,
          sessionTimeoutMinutes: 60,
        },
      });
    });

    it('should use default values when env vars are missing', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      // Clear other env vars
      delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
      delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
      delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

      const config = detector.getTenantFirebaseConfig('test-tenant');

      expect(config?.authDomain).toBe('test-project.firebaseapp.com');
      expect(config?.storageBucket).toBe('test-project.appspot.com');
      expect(config?.appId).toBe('');
      expect(config?.measurementId).toBeUndefined();
    });
  });

  describe('getTierLimits', () => {
    it('should return development limits', () => {
      const limits = (detector as any).getTierLimits('development');
      expect(limits).toEqual({
        maxDocuments: 100000,
        maxStorageGB: 5,
        maxMonthlyReads: 1000000,
        maxMonthlyWrites: 100000,
      });
    });

    it('should return basic limits', () => {
      const limits = (detector as any).getTierLimits('basic');
      expect(limits).toEqual({
        maxDocuments: 1000000,
        maxStorageGB: 50,
        maxMonthlyReads: 10000000,
        maxMonthlyWrites: 1000000,
      });
    });

    it('should return premium limits', () => {
      const limits = (detector as any).getTierLimits('premium');
      expect(limits).toEqual({
        maxDocuments: 10000000,
        maxStorageGB: 500,
        maxMonthlyReads: 100000000,
        maxMonthlyWrites: 10000000,
      });
    });

    it('should return enterprise limits', () => {
      const limits = (detector as any).getTierLimits('enterprise');
      expect(limits).toEqual({
        maxDocuments: -1,
        maxStorageGB: -1,
        maxMonthlyReads: -1,
        maxMonthlyWrites: -1,
      });
    });
  });

  describe('getSecurityConfig', () => {
    it('should return development security config', () => {
      const security = (detector as any).getSecurityConfig('development');
      expect(security).toEqual({
        allowAnonymous: true,
        requireEmailVerification: false,
        enableMfa: false,
        sessionTimeoutMinutes: 60,
      });
    });

    it('should return basic security config', () => {
      const security = (detector as any).getSecurityConfig('basic');
      expect(security).toEqual({
        allowAnonymous: true,
        requireEmailVerification: false,
        enableMfa: false,
        sessionTimeoutMinutes: 30,
      });
    });

    it('should return premium security config', () => {
      const security = (detector as any).getSecurityConfig('premium');
      expect(security).toEqual({
        allowAnonymous: false,
        requireEmailVerification: true,
        enableMfa: false,
        sessionTimeoutMinutes: 60,
      });
    });

    it('should return enterprise security config', () => {
      const security = (detector as any).getSecurityConfig('enterprise');
      expect(security).toEqual({
        allowAnonymous: false,
        requireEmailVerification: true,
        enableMfa: true,
        sessionTimeoutMinutes: 480,
      });
    });
  });

  describe('validateEnvironment', () => {
    it('should validate Firebase environment successfully', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test.appspot.com';

      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate local environment successfully', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      process.env.QDRANT_URL = 'http://localhost:6333';
      process.env.INGEST_TOKEN = 'test-token';

      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing Firebase project ID', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/creds.json';
      delete process.env.FIREBASE_PROJECT_ID;
      jest.spyOn(detector, 'getTenantFirebaseConfig').mockReturnValue(null);
      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Firebase is enabled but configuration is missing');
    });

    it('should report missing Firebase auth domain', () => {
      process.env.FIREBASE_PROJECT_ID = 'test';
      jest.spyOn(detector, 'getTenantFirebaseConfig').mockReturnValue({
        tenantId: 'test',
        projectId: 'test',
        region: 'us-central1',
        tier: 'basic',
        authDomain: '',
        storageBucket: 'test.appspot.com',
        messagingSenderId: '',
        appId: '',
        measurementId: '',
        features: { firestoreEnabled: true, authEnabled: true, storageEnabled: true, analyticsEnabled: false, hostingEnabled: true },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, maxMonthlyReads: 10000000, maxMonthlyWrites: 1000000 },
        security: { allowAnonymous: true, requireEmailVerification: false, enableMfa: false, sessionTimeoutMinutes: 30 },
      } as any);
      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('FIREBASE_AUTH_DOMAIN environment variable is required');
    });

    it('should report missing Firebase storage bucket', () => {
      process.env.FIREBASE_PROJECT_ID = 'test';
      jest.spyOn(detector, 'getTenantFirebaseConfig').mockReturnValue({
        tenantId: 'test',
        projectId: 'test',
        region: 'us-central1',
        tier: 'basic',
        authDomain: 'test.firebaseapp.com',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        measurementId: '',
        features: { firestoreEnabled: true, authEnabled: true, storageEnabled: true, analyticsEnabled: false, hostingEnabled: true },
        limits: { maxDocuments: 1000000, maxStorageGB: 50, maxMonthlyReads: 10000000, maxMonthlyWrites: 1000000 },
        security: { allowAnonymous: true, requireEmailVerification: false, enableMfa: false, sessionTimeoutMinutes: 30 },
      } as any);
      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('FIREBASE_STORAGE_BUCKET environment variable is required');
    });

    it('should report missing Qdrant URL for local', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.QDRANT_URL;
      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('QDRANT_URL environment variable is required for local mode');
    });

    it('should report missing ingest token for local', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      process.env.QDRANT_URL = 'http://localhost:6333';
      delete process.env.INGEST_TOKEN;
      const result = detector.validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('INGEST_TOKEN environment variable is required');
    });
  });

  describe('getDatabaseUrl', () => {
    it('should return Firestore URL for Firebase environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      const url = detector.getDatabaseUrl();
      expect(url).toBe('firestore://test-project');
    });

    it('should return Qdrant URL for local environment', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      process.env.QDRANT_URL = 'http://localhost:6333';
      const url = detector.getDatabaseUrl();
      expect(url).toBe('http://localhost:6333');
    });

    it('should return default Qdrant URL', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.QDRANT_URL;
      const url = detector.getDatabaseUrl();
      expect(url).toBe('http://localhost:6333');
    });
  });

  describe('getEmbeddingsUrl', () => {
    it('should return Vertex AI URL for Firebase environment', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      process.env.FIREBASE_REGION = 'us-central1';
      const url = detector.getEmbeddingsUrl();
      expect(url).toBe('vertex-ai://us-central1');
    });

    it('should return local embeddings URL', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      process.env.EMBEDDINGS_URL = 'http://localhost:8080';
      const url = detector.getEmbeddingsUrl();
      expect(url).toBe('http://localhost:8080');
    });

    it('should return default embeddings URL', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.EMBEDDINGS_URL;
      const url = detector.getEmbeddingsUrl();
      expect(url).toBe('http://localhost:8080');
    });
  });

  describe('getLoggingConfig', () => {
    it('should return production logging config', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIREBASE_PROJECT_ID = 'test';
      const config = detector.getLoggingConfig();
      expect(config.level).toBe('info');
      expect(config.enableStructuredLogging).toBe(true);
      expect(config.enableCloudLogging).toBe(true);
      expect(config.enableLocalPrettyPrint).toBe(false);
      expect(config.enablePerformanceTracking).toBe(true);
    });

    it('should return development logging config', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.FIREBASE_PROJECT_ID;
      const config = detector.getLoggingConfig();
      expect(config.level).toBe('debug');
      expect(config.enableStructuredLogging).toBe(false);
      expect(config.enableCloudLogging).toBe(false);
      expect(config.enableLocalPrettyPrint).toBe(true);
      expect(config.enablePerformanceTracking).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear the environment cache', () => {
      detector.getEnvironmentContext('tenant1');
      expect((detector as any)._environmentCache.size).toBe(1);

      detector.clearCache();
      expect((detector as any)._environmentCache.size).toBe(0);
    });
  });

  describe('exported singleton', () => {
    it('should be the same instance as getInstance()', () => {
      expect(environmentDetector).toStrictEqual(EnvironmentDetector.getInstance());
    });
  });
});