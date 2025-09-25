/**
 * Firebase Configuration Management
 * Supports multi-tenant Firebase projects with regional preferences
 */

export type FirebaseRegion =
  | 'europe-west3'     // Frankfurt, Germany (GDPR compliant)
  | 'europe-west1'     // Belgium
  | 'us-central1'      // Iowa, US
  | 'asia-northeast1'; // Tokyo, Japan

export type TenantTier = 'development' | 'basic' | 'premium' | 'enterprise';

export interface FirebaseConfig {
  projectId: string;
  region: FirebaseRegion;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface TenantFirebaseConfig extends FirebaseConfig {
  tenantId: string;
  tier: TenantTier;
  features: {
    firestoreEnabled: boolean;
    authEnabled: boolean;
    storageEnabled: boolean;
    analyticsEnabled: boolean;
    hostingEnabled: boolean;
  };
  limits: {
    maxDocuments: number;
    maxStorageGB: number;
    maxMonthlyReads: number;
    maxMonthlyWrites: number;
  };
  security: {
    allowAnonymous: boolean;
    requireEmailVerification: boolean;
    enableMfa: boolean;
    sessionTimeoutMinutes: number;
  };
}

export interface FirebaseServiceConfig {
  // Firestore configuration
  firestore: {
    locationId: string; // e.g., 'eur3' for europe-west3
    databaseId: string; // Default: '(default)'
    enableOffline: boolean;
    cacheSizeBytes: number;
  };

  // Authentication configuration
  auth: {
    enableAnonymous: boolean;
    enableCustomToken: boolean;
    enableEmailPassword: boolean;
    signInFlow: 'popup' | 'redirect';
    customClaims: string[];
  };

  // Storage configuration
  storage: {
    maxUploadSizeBytes: number;
    allowedMimeTypes: string[];
    corsOrigins: string[];
  };

  // Performance and monitoring
  performance: {
    enablePerformanceMonitoring: boolean;
    enableCrashlytics: boolean;
    sampleRate: number;
  };
}

export const DEFAULT_FIREBASE_REGIONS: Record<string, FirebaseRegion> = {
  'eu': 'europe-west3',    // Germany - GDPR compliant default
  'us': 'us-central1',     // US default
  'asia': 'asia-northeast1' // Asia default
};

export const TIER_LIMITS: Record<TenantTier, TenantFirebaseConfig['limits']> = {
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
    maxDocuments: -1, // Unlimited
    maxStorageGB: -1, // Unlimited
    maxMonthlyReads: -1, // Unlimited
    maxMonthlyWrites: -1, // Unlimited
  },
};

export const TIER_FEATURES: Record<TenantTier, TenantFirebaseConfig['features']> = {
  development: {
    firestoreEnabled: true,
    authEnabled: true,
    storageEnabled: true,
    analyticsEnabled: false,
    hostingEnabled: true,
  },
  basic: {
    firestoreEnabled: true,
    authEnabled: true,
    storageEnabled: true,
    analyticsEnabled: true,
    hostingEnabled: true,
  },
  premium: {
    firestoreEnabled: true,
    authEnabled: true,
    storageEnabled: true,
    analyticsEnabled: true,
    hostingEnabled: true,
  },
  enterprise: {
    firestoreEnabled: true,
    authEnabled: true,
    storageEnabled: true,
    analyticsEnabled: true,
    hostingEnabled: true,
  },
};

export const DEFAULT_SECURITY_CONFIG: Record<TenantTier, TenantFirebaseConfig['security']> = {
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
    sessionTimeoutMinutes: 480, // 8 hours
  },
};

/**
 * Creates a complete Firebase configuration for a tenant
 */
export function createTenantFirebaseConfig(
  tenantId: string,
  projectId: string,
  tier: TenantTier = 'basic',
  region: FirebaseRegion = 'europe-west3'
): TenantFirebaseConfig {
  return {
    tenantId,
    projectId,
    region,
    tier,
    authDomain: `${projectId}.firebaseapp.com`,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: '', // To be filled by actual Firebase project
    appId: '', // To be filled by actual Firebase project
    features: TIER_FEATURES[tier],
    limits: TIER_LIMITS[tier],
    security: DEFAULT_SECURITY_CONFIG[tier],
  };
}

/**
 * Validates Firebase configuration completeness
 */
export function validateFirebaseConfig(config: FirebaseConfig): boolean {
  const requiredFields: (keyof FirebaseConfig)[] = [
    'projectId',
    'authDomain',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];

  return requiredFields.every(field => {
    const value = config[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Gets the Firestore location ID from Firebase region
 */
export function getFirestoreLocationId(region: FirebaseRegion): string {
  const locationMap: Record<FirebaseRegion, string> = {
    'europe-west3': 'eur3',
    'europe-west1': 'eur3',
    'us-central1': 'nam5',
    'asia-northeast1': 'asia-northeast1',
  };

  return locationMap[region] || 'eur3'; // Default to EU
}

/**
 * Gets the Cloud Run region from Firebase region
 */
export function getCloudRunRegion(region: FirebaseRegion): string {
  const regionMap: Record<FirebaseRegion, string> = {
    'europe-west3': 'europe-west3',
    'europe-west1': 'europe-west1',
    'us-central1': 'us-central1',
    'asia-northeast1': 'asia-northeast1',
  };

  return regionMap[region] || 'europe-west3'; // Default to Germany
}