/**
 * Environment Detection Service
 * Determines whether to use local Docker stack or Firebase/GCP services
 */

import { FirebaseConfig, TenantFirebaseConfig, TenantTier, FirebaseRegion } from '../config/firebase-config.js';

export interface EnvironmentContext {
  isLocal: boolean;
  isFirebase: boolean;
  isProduction: boolean;
  tenantId: string;
  region: FirebaseRegion;
  tier: TenantTier;
}

export class EnvironmentDetector {
  private static _instance: EnvironmentDetector;
  private _environmentCache: Map<string, EnvironmentContext> = new Map();

  static getInstance(): EnvironmentDetector {
    if (!this._instance) {
      this._instance = new EnvironmentDetector();
    }
    return this._instance;
  }

  /**
   * Checks if Firebase is enabled for the current environment
   */
  static isFirebaseEnabled(): boolean {
    return !!(
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
  }

  /**
   * Checks if running in local Docker environment
   */
  static isLocal(): boolean {
    return !this.isFirebaseEnabled() && (
      process.env.NODE_ENV !== 'production' ||
      !!process.env.QDRANT_URL?.includes('localhost') ||
      !!process.env.QDRANT_URL?.includes('qdrant:6333')
    );
  }

  /**
   * Checks if running in production Firebase environment
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production' && this.isFirebaseEnabled();
  }

  /**
   * Gets the current tenant ID from environment or headers
   */
  static getCurrentTenantId(): string {
    return (
      process.env.TENANT ||
      process.env.NEXT_PUBLIC_TENANT_ID ||
      'default'
    );
  }

  /**
   * Gets the preferred region from environment
   */
  static getPreferredRegion(): FirebaseRegion {
    const region = process.env.FIREBASE_REGION || process.env.GCP_REGION;

    switch (region) {
      case 'europe-west3':
      case 'europe-west1':
      case 'us-central1':
      case 'asia-northeast1':
        return region as FirebaseRegion;
      default:
        return 'europe-west3'; // Default to Germany
    }
  }

  /**
   * Gets the tenant tier from environment
   */
  static getTenantTier(): TenantTier {
    const tier = process.env.TENANT_TIER;

    switch (tier) {
      case 'development':
      case 'basic':
      case 'premium':
      case 'enterprise':
        return tier;
      default:
        return this.isProduction() ? 'basic' : 'development';
    }
  }

  /**
   * Gets the complete environment context for a tenant
   */
  getEnvironmentContext(tenantId?: string): EnvironmentContext {
    const resolvedTenantId = tenantId || EnvironmentDetector.getCurrentTenantId();

    // Check cache first
    const cached = this._environmentCache.get(resolvedTenantId);
    if (cached) {
      return cached;
    }

    const context: EnvironmentContext = {
      isLocal: EnvironmentDetector.isLocal(),
      isFirebase: EnvironmentDetector.isFirebaseEnabled(),
      isProduction: EnvironmentDetector.isProduction(),
      tenantId: resolvedTenantId,
      region: EnvironmentDetector.getPreferredRegion(),
      tier: EnvironmentDetector.getTenantTier(),
    };

    // Cache for 5 minutes
    this._environmentCache.set(resolvedTenantId, context);
    setTimeout(() => {
      this._environmentCache.delete(resolvedTenantId);
    }, 5 * 60 * 1000);

    return context;
  }

  /**
   * Gets Firebase configuration for the current tenant
   */
  getTenantFirebaseConfig(tenantId?: string): TenantFirebaseConfig | null {
    const context = this.getEnvironmentContext(tenantId);

    if (!context.isFirebase) {
      return null;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID ||
                     process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
      return null;
    }

    return {
      tenantId: context.tenantId,
      projectId,
      region: context.region,
      tier: context.tier,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
      features: {
        firestoreEnabled: process.env.FIRESTORE_ENABLED !== 'false',
        authEnabled: process.env.FIREBASE_AUTH_ENABLED !== 'false',
        storageEnabled: process.env.FIREBASE_STORAGE_ENABLED !== 'false',
        analyticsEnabled: process.env.FIREBASE_ANALYTICS_ENABLED === 'true',
        hostingEnabled: process.env.FIREBASE_HOSTING_ENABLED !== 'false',
      },
      limits: this.getTierLimits(context.tier),
      security: this.getSecurityConfig(context.tier),
    };
  }

  /**
   * Gets tier-specific limits
   */
  private getTierLimits(tier: TenantTier): TenantFirebaseConfig['limits'] {
    const limits = {
      development: {
        maxDocuments: 100000,
        maxStorageGB: 5,
        maxMonthlyReads: 1000000,
        maxMonthlyWrites: 100000,
      },
      basic: {
        maxDocuments: 1000000,
        maxStorageGB: 50,
        maxMonthlyReads: 10000000,
        maxMonthlyWrites: 1000000,
      },
      premium: {
        maxDocuments: 10000000,
        maxStorageGB: 500,
        maxMonthlyReads: 100000000,
        maxMonthlyWrites: 10000000,
      },
      enterprise: {
        maxDocuments: -1,
        maxStorageGB: -1,
        maxMonthlyReads: -1,
        maxMonthlyWrites: -1,
      },
    };

    return limits[tier];
  }

  /**
   * Gets tier-specific security configuration
   */
  private getSecurityConfig(tier: TenantTier): TenantFirebaseConfig['security'] {
    const security = {
      development: {
        allowAnonymous: true,
        requireEmailVerification: false,
        enableMfa: false,
        sessionTimeoutMinutes: 60,
      },
      basic: {
        allowAnonymous: true,
        requireEmailVerification: false,
        enableMfa: false,
        sessionTimeoutMinutes: 30,
      },
      premium: {
        allowAnonymous: false,
        requireEmailVerification: true,
        enableMfa: false,
        sessionTimeoutMinutes: 60,
      },
      enterprise: {
        allowAnonymous: false,
        requireEmailVerification: true,
        enableMfa: true,
        sessionTimeoutMinutes: 480,
      },
    };

    return security[tier];
  }

  /**
   * Validates that the current environment is properly configured
   */
  validateEnvironment(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const context = this.getEnvironmentContext();

    if (context.isFirebase) {
      // Validate Firebase configuration
      const config = this.getTenantFirebaseConfig();
      if (!config) {
        errors.push('Firebase is enabled but configuration is missing');
      } else {
        if (!config.projectId) {
          errors.push('FIREBASE_PROJECT_ID environment variable is required');
        }
        if (!config.authDomain) {
          errors.push('FIREBASE_AUTH_DOMAIN environment variable is required');
        }
        if (!config.storageBucket) {
          errors.push('FIREBASE_STORAGE_BUCKET environment variable is required');
        }
      }
    } else if (context.isLocal) {
      // Validate local configuration
      if (!process.env.QDRANT_URL) {
        errors.push('QDRANT_URL environment variable is required for local mode');
      }
      if (!process.env.INGEST_TOKEN) {
        errors.push('INGEST_TOKEN environment variable is required');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Gets the appropriate database URL based on environment
   */
  getDatabaseUrl(): string {
    const context = this.getEnvironmentContext();

    if (context.isFirebase) {
      const config = this.getTenantFirebaseConfig();
      return `firestore://${config?.projectId}`;
    }

    return process.env.QDRANT_URL || 'http://localhost:6333';
  }

  /**
   * Gets the appropriate embeddings service URL based on environment
   */
  getEmbeddingsUrl(): string {
    const context = this.getEnvironmentContext();

    if (context.isFirebase) {
      // Use Vertex AI embeddings in Firebase mode
      return `vertex-ai://${context.region}`;
    }

    return process.env.EMBEDDINGS_URL || 'http://localhost:8080';
  }

  /**
   * Gets environment-specific logging configuration
   */
  getLoggingConfig() {
    const context = this.getEnvironmentContext();

    return {
      level: context.isProduction ? 'info' : 'debug',
      enableStructuredLogging: context.isFirebase,
      enableCloudLogging: context.isFirebase,
      enableLocalPrettyPrint: context.isLocal,
      enablePerformanceTracking: context.tier !== 'development',
    };
  }

  /**
   * Clears the environment cache (useful for testing)
   */
  clearCache(): void {
    this._environmentCache.clear();
  }
}

// Export singleton instance
export const environmentDetector = EnvironmentDetector.getInstance();