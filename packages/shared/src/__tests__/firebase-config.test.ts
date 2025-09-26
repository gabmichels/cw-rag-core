/**
 * Tests for Firebase configuration and environment detection
 */

import {
  createTenantFirebaseConfig,
  validateFirebaseConfig,
  getFirestoreLocationId,
  getCloudRunRegion,
  FirebaseRegion,
  TenantTier
} from '../config/firebase-config.js';
import { EnvironmentDetector } from '../services/environment-detector.js';
import { ConfigurationService } from '../services/configuration-service.js';

describe('Firebase Configuration', () => {
  describe('createTenantFirebaseConfig', () => {
    it('should create valid Firebase config for basic tier', () => {
      const config = createTenantFirebaseConfig(
        'test-tenant',
        'test-project-123',
        'basic',
        'europe-west3'
      );

      expect(config.tenantId).toBe('test-tenant');
      expect(config.projectId).toBe('test-project-123');
      expect(config.tier).toBe('basic');
      expect(config.region).toBe('europe-west3');
      expect(config.authDomain).toBe('test-project-123.firebaseapp.com');
      expect(config.storageBucket).toBe('test-project-123.appspot.com');
      expect(config.features.firestoreEnabled).toBe(true);
      expect(config.features.authEnabled).toBe(true);
      expect(config.limits.maxDocuments).toBe(1000000);
    });

    it('should create enterprise config with unlimited limits', () => {
      const config = createTenantFirebaseConfig(
        'enterprise-tenant',
        'enterprise-project',
        'enterprise',
        'europe-west3'
      );

      expect(config.tier).toBe('enterprise');
      expect(config.limits.maxDocuments).toBe(-1);
      expect(config.limits.maxStorageGB).toBe(-1);
      expect(config.security.enableMfa).toBe(true);
      expect(config.security.requireEmailVerification).toBe(true);
    });
  });

  describe('validateFirebaseConfig', () => {
    it('should validate complete config', () => {
      const config = {
        projectId: 'test-project',
        region: 'europe-west3' as FirebaseRegion,
        authDomain: 'test-project.firebaseapp.com',
        storageBucket: 'test-project.appspot.com',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef123456',
      };

      expect(validateFirebaseConfig(config)).toBe(true);
    });

    it('should reject incomplete config', () => {
      const incompleteConfig = {
        projectId: 'test-project',
        region: 'europe-west3' as FirebaseRegion,
        authDomain: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
      };

      expect(validateFirebaseConfig(incompleteConfig)).toBe(false);
    });
  });

  describe('region mapping functions', () => {
    it('should map Firebase regions to Firestore locations', () => {
      expect(getFirestoreLocationId('europe-west3')).toBe('eur3');
      expect(getFirestoreLocationId('us-central1')).toBe('nam5');
      expect(getFirestoreLocationId('asia-northeast1')).toBe('asia-northeast1');
    });

    it('should map Firebase regions to Cloud Run regions', () => {
      expect(getCloudRunRegion('europe-west3')).toBe('europe-west3');
      expect(getCloudRunRegion('us-central1')).toBe('us-central1');
    });
  });
});

describe('Environment Detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    EnvironmentDetector.getInstance().clearCache();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isFirebaseEnabled', () => {
    it('should detect Firebase when project ID is set', () => {
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      expect(EnvironmentDetector.isFirebaseEnabled()).toBe(true);
    });

    it('should detect local mode when no Firebase config', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      expect(EnvironmentDetector.isFirebaseEnabled()).toBe(false);
      expect(EnvironmentDetector.isLocal()).toBe(true);
    });
  });

  describe('getPreferredRegion', () => {
    it('should default to Europe (Germany)', () => {
      expect(EnvironmentDetector.getPreferredRegion()).toBe('europe-west3');
    });

    it('should use environment variable', () => {
      process.env.FIREBASE_REGION = 'us-central1';
      expect(EnvironmentDetector.getPreferredRegion()).toBe('us-central1');
    });
  });

  describe('getTenantTier', () => {
    it('should default to development for non-production', () => {
      process.env.NODE_ENV = 'development';
      expect(EnvironmentDetector.getTenantTier()).toBe('development');
    });

    it('should default to basic for production', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIREBASE_PROJECT_ID = 'test-project'; // Required for isProduction() to return true
      expect(EnvironmentDetector.getTenantTier()).toBe('basic');
      delete process.env.FIREBASE_PROJECT_ID; // Clean up
    });

    it('should use environment variable', () => {
      process.env.TENANT_TIER = 'premium';
      expect(EnvironmentDetector.getTenantTier()).toBe('premium');
    });
  });
});

describe('Configuration Service', () => {
  const configService = ConfigurationService.getInstance();

  beforeEach(() => {
    configService.clearCache();
  });

  describe('getDatabaseConfig', () => {
    it('should return Qdrant config for local environment', () => {
      // Mock local environment
      process.env.QDRANT_URL = 'http://localhost:6333';
      delete process.env.FIREBASE_PROJECT_ID;

      const dbConfig = configService.getDatabaseConfig('test-tenant');

      expect(dbConfig.type).toBe('qdrant');
      expect(dbConfig.url).toBe('http://localhost:6333');
      expect(dbConfig.collection).toBe('docs_v1');
    });
  });

  describe('getAuthConfig', () => {
    it('should return token auth for local environment', () => {
      delete process.env.FIREBASE_PROJECT_ID;
      process.env.INGEST_TOKEN = 'test-token';

      const authConfig = configService.getAuthConfig('test-tenant');

      expect(authConfig.type).toBe('token');
      expect(authConfig.options.token).toBe('test-token');
      expect(authConfig.options.headerName).toBe('x-ingest-token');
    });
  });

  describe('getCorsConfig', () => {
    it('should return local CORS config for development', () => {
      delete process.env.FIREBASE_PROJECT_ID;

      const corsConfig = configService.getCorsConfig('test-tenant');

      expect(corsConfig.origins).toContain('http://localhost:3001');
      expect(corsConfig.origins).toContain('http://localhost:3000');
      expect(corsConfig.credentials).toBe(true);
    });
  });
});