# User Management and Analytics Architecture

## Overview

You're absolutely right - you'll need proper user management and usage tracking. **Firestore is the perfect choice** for this, especially with your GCP deployment strategy. This document outlines how to add user management and analytics while maintaining your clean tenant isolation.

## Recommended Architecture: Distributed Firestore

### Pattern: One Firestore Per Tenant Project + Central Analytics

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           COMPANY LEVEL                                             │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                    MANAGEMENT PROJECT                                       │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ Central         │  │ Cross-Tenant    │  │ Billing Aggregation         │   │   │
│  │  │ Analytics DB    │  │ Reporting       │  │ & Cost Analytics            │   │   │
│  │  │ (Firestore)     │  │ (Cloud Run)     │  │ (BigQuery)                  │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  │           ▲                      ▲                       ▲                   │   │
│  └───────────┼──────────────────────┼───────────────────────┼───────────────────┘   │
│              │                      │                       │                       │
│              │ Analytics Data       │ Usage Reports         │ Cost Data             │
│              │                      │                       │                       │
└──────────────┼──────────────────────┼───────────────────────┼───────────────────────┘
               │                      │                       │
┌──────────────┼──────────────────────┼───────────────────────┼───────────────────────┐
│              │ TENANT LEVEL         │                       │                       │
│              ▼                      ▼                       ▼                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      TENANT A PROJECT                                       │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ RAG Stack   │  │ User Mgmt   │  │ Usage       │  │ Tenant Analytics│   │   │
│  │  │             │  │ Firestore   │  │ Tracking    │  │ Dashboard       │   │   │
│  │  │ • API       │  │             │  │ Firestore   │  │ (Cloud Run)     │   │   │
│  │  │ • Web       │  │ • Users     │  │             │  │                 │   │   │
│  │  │ • Qdrant    │  │ • Roles     │  │ • Queries   │  │ • Usage Stats   │   │   │
│  │  │ • Embeddings│  │ • Sessions  │  │ • Documents │  │ • User Activity │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      TENANT B PROJECT                                       │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ RAG Stack   │  │ User Mgmt   │  │ Usage       │  │ Tenant Analytics│   │   │
│  │  │             │  │ Firestore   │  │ Tracking    │  │ Dashboard       │   │   │
│  │  │ • API       │  │             │  │ Firestore   │  │ (Cloud Run)     │   │   │
│  │  │ • Web       │  │ • Users     │  │             │  │                 │   │   │
│  │  │ • Qdrant    │  │ • Roles     │  │ • Queries   │  │ • Usage Stats   │   │   │
│  │  │ • Embeddings│  │ • Sessions  │  │ • Documents │  │ • User Activity │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Architecture

### Tenant-Level Firestore Collections

Each tenant project has its own Firestore with these collections:

```typescript
// Per-tenant Firestore schema
interface TenantFirestoreSchema {
  // User Management
  users: {
    [userId: string]: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user' | 'viewer';
      groupIds: string[];
      tenantId: string;  // Always matches tenant
      createdAt: Date;
      lastLoginAt: Date;
      isActive: boolean;
      permissions: string[];
      metadata: Record<string, any>;
    };
  };

  // User Sessions
  sessions: {
    [sessionId: string]: {
      userId: string;
      createdAt: Date;
      expiresAt: Date;
      ipAddress: string;
      userAgent: string;
      isActive: boolean;
    };
  };

  // Query History
  queries: {
    [queryId: string]: {
      userId: string;
      query: string;
      resultsCount: number;
      responseTime: number;
      timestamp: Date;
      documentsAccessed: string[];
      confidence: number;
      satisfaction?: number;  // User feedback
    };
  };

  // Document Access Logs
  documentAccess: {
    [accessId: string]: {
      userId: string;
      documentId: string;
      accessType: 'view' | 'download' | 'search_result';
      timestamp: Date;
      source: string;  // query_id or direct access
    };
  };

  // Usage Statistics (daily aggregations)
  dailyUsage: {
    [date: string]: {  // YYYY-MM-DD
      totalQueries: number;
      uniqueUsers: number;
      documentsAccessed: number;
      avgResponseTime: number;
      topQueries: Array<{query: string, count: number}>;
      topUsers: Array<{userId: string, queryCount: number}>;
    };
  };

  // Tenant Settings
  tenantSettings: {
    general: {
      name: string;
      domain: string;
      tier: string;
      features: string[];
      limits: {
        maxUsers: number;
        maxQueries: number;
        maxDocuments: number;
      };
    };
  };
}
```

### Central Management Firestore Collections

Management project aggregates cross-tenant data:

```typescript
// Management project Firestore schema
interface ManagementFirestoreSchema {
  // Company-wide analytics
  companyAnalytics: {
    [date: string]: {  // YYYY-MM-DD
      totalTenants: number;
      totalUsers: number;
      totalQueries: number;
      totalCost: number;
      tenantBreakdown: Array<{
        tenantId: string;
        queries: number;
        users: number;
        cost: number;
      }>;
    };
  };

  // Tenant metadata
  tenants: {
    [tenantId: string]: {
      name: string;
      projectId: string;
      tier: string;
      status: 'active' | 'suspended' | 'trial';
      createdAt: Date;
      lastActivity: Date;
      currentUsers: number;
      monthlyQueries: number;
      monthlyCost: number;
    };
  };

  // Cross-tenant user directory (for admin purposes)
  globalUsers: {
    [email: string]: {
      tenants: Array<{
        tenantId: string;
        role: string;
        lastLogin: Date;
      }>;
    };
  };
}
```

## Implementation Strategy

### Phase 1: Add Firestore to Existing Setup (1 hour)

#### Step 1: Update Terraform to Include Firestore (20 min)

```hcl
# Add to terraform/simple-tenant/main.tf

# Enable Firestore API
resource "google_project_service" "firestore" {
  project = google_project.tenant_project.project_id
  service = "firestore.googleapis.com"
}

# Create Firestore database
resource "google_firestore_database" "tenant_db" {
  project     = google_project.tenant_project.project_id
  name        = "(default)"
  location_id = "us-central1"
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.firestore]
}

# Create service account with Firestore permissions
resource "google_project_iam_member" "firestore_permissions" {
  project = google_project.tenant_project.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.tenant_service_account.email}"
}
```

#### Step 2: Create User Management Service (30 min)

```typescript
// apps/api/src/services/user-management.ts
import { Firestore } from '@google-cloud/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  groupIds: string[];
  tenantId: string;
  createdAt: Date;
  lastLoginAt: Date;
  isActive: boolean;
  permissions: string[];
  metadata: Record<string, any>;
}

export interface QueryLog {
  userId: string;
  query: string;
  resultsCount: number;
  responseTime: number;
  timestamp: Date;
  documentsAccessed: string[];
  confidence: number;
}

export class UserManagementService {
  private firestore: Firestore;
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.firestore = new Firestore({
      projectId: process.env.FIRESTORE_PROJECT || process.env.TENANT_PROJECT_ID
    });
  }

  // User management
  async createUser(userData: Partial<User>): Promise<User> {
    const user: User = {
      id: this.generateUserId(),
      tenantId: this.tenantId,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      isActive: true,
      permissions: [],
      metadata: {},
      ...userData
    } as User;

    await this.firestore.collection('users').doc(user.id).set(user);
    return user;
  }

  async getUser(userId: string): Promise<User | null> {
    const doc = await this.firestore.collection('users').doc(userId).get();
    if (!doc.exists) return null;

    const userData = doc.data() as User;

    // Security: Ensure user belongs to this tenant
    if (userData.tenantId !== this.tenantId) {
      throw new Error('Cross-tenant access denied');
    }

    return userData;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const query = await this.firestore
      .collection('users')
      .where('email', '==', email)
      .where('tenantId', '==', this.tenantId)
      .limit(1)
      .get();

    if (query.empty) return null;
    return query.docs[0].data() as User;
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await this.firestore.collection('users').doc(userId).update({
      lastLoginAt: new Date()
    });
  }

  // Usage tracking
  async logQuery(queryLog: QueryLog): Promise<void> {
    const logId = this.generateQueryId();
    await this.firestore.collection('queries').doc(logId).set({
      ...queryLog,
      id: logId,
      tenantId: this.tenantId
    });

    // Update daily usage statistics
    await this.updateDailyUsage(queryLog);
  }

  async logDocumentAccess(userId: string, documentId: string, accessType: string, source?: string): Promise<void> {
    const accessId = this.generateAccessId();
    await this.firestore.collection('documentAccess').doc(accessId).set({
      userId,
      documentId,
      accessType,
      timestamp: new Date(),
      source: source || 'direct',
      tenantId: this.tenantId
    });
  }

  // Analytics
  async getDailyUsage(date: string): Promise<any> {
    const doc = await this.firestore.collection('dailyUsage').doc(date).get();
    return doc.exists ? doc.data() : null;
  }

  async getUserUsageStats(userId: string, days: number = 30): Promise<any> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const queries = await this.firestore
      .collection('queries')
      .where('userId', '==', userId)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();

    return {
      totalQueries: queries.size,
      avgResponseTime: queries.docs.reduce((sum, doc) => sum + doc.data().responseTime, 0) / queries.size,
      documentsAccessed: new Set(queries.docs.flatMap(doc => doc.data().documentsAccessed)).size
    };
  }

  private async updateDailyUsage(queryLog: QueryLog): Promise<void> {
    const date = queryLog.timestamp.toISOString().split('T')[0];
    const docRef = this.firestore.collection('dailyUsage').doc(date);

    await this.firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        transaction.set(docRef, {
          date,
          totalQueries: 1,
          uniqueUsers: new Set([queryLog.userId]),
          documentsAccessed: queryLog.documentsAccessed.length,
          avgResponseTime: queryLog.responseTime,
          topQueries: [{query: queryLog.query, count: 1}],
          topUsers: [{userId: queryLog.userId, queryCount: 1}]
        });
      } else {
        const data = doc.data()!;
        transaction.update(docRef, {
          totalQueries: data.totalQueries + 1,
          documentsAccessed: data.documentsAccessed + queryLog.documentsAccessed.length,
          avgResponseTime: (data.avgResponseTime * data.totalQueries + queryLog.responseTime) / (data.totalQueries + 1)
        });
      }
    });
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAccessId(): string {
    return `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

#### Step 3: Integrate with Existing API (10 min)

```typescript
// apps/api/src/routes/ask.ts - Update to include tracking
import { UserManagementService } from '../services/user-management.js';

export async function askRoute(fastify: FastifyInstance, options: any) {
  const userService = new UserManagementService(process.env.TENANT!);

  fastify.post('/ask', async (request, reply) => {
    const startTime = Date.now();

    // Your existing ask logic here...
    const results = await searchDocuments(/* ... */);

    const responseTime = Date.now() - startTime;

    // Log the query
    await userService.logQuery({
      userId: request.body.userContext.id,
      query: request.body.query,
      resultsCount: results.length,
      responseTime,
      timestamp: new Date(),
      documentsAccessed: results.map(r => r.id),
      confidence: calculateConfidence(results)
    });

    // Log document access
    for (const result of results) {
      await userService.logDocumentAccess(
        request.body.userContext.id,
        result.id,
        'search_result',
        'query'
      );
    }

    return results;
  });
}
```

### Phase 2: Add Authentication (1 hour)

#### Step 4: Add Firebase Auth (30 min)

```typescript
// apps/api/src/middleware/auth.ts
import { auth } from 'firebase-admin/auth';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'No valid authentication token' });
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await auth().verifyIdToken(token);
    const userService = new UserManagementService(process.env.TENANT!);

    // Get or create user in our system
    let user = await userService.getUserByEmail(decodedToken.email!);
    if (!user) {
      user = await userService.createUser({
        email: decodedToken.email!,
        name: decodedToken.name || decodedToken.email!,
        role: 'user'  // Default role
      });
    }

    // Update last login
    await userService.updateUserLastLogin(user.id);

    // Attach user to request
    request.user = user;
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid authentication token' });
  }
}
```

#### Step 5: Add Web Authentication (30 min)

```typescript
// apps/web/src/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../firebase.config';

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    return signOut(auth);
  };

  const getAuthToken = async () => {
    if (!user) return null;
    return user.getIdToken();
  };

  return {
    user,
    loading,
    login,
    register,
    logout,
    getAuthToken
  };
}
```

### Phase 3: Add Analytics Dashboard (1 hour)

#### Step 6: Create Analytics API Endpoints (30 min)

```typescript
// apps/api/src/routes/analytics.ts
export async function analyticsRoutes(fastify: FastifyInstance, options: any) {
  const userService = new UserManagementService(process.env.TENANT!);

  // Tenant-level analytics
  fastify.get('/analytics/usage/:days', async (request: FastifyRequest<{Params: {days: string}}>) => {
    const days = parseInt(request.params.days);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const dailyUsage = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const usage = await userService.getDailyUsage(dateStr);
      dailyUsage.push({
        date: dateStr,
        ...usage
      });
    }

    return { dailyUsage };
  });

  fastify.get('/analytics/user/:userId', async (request: FastifyRequest<{Params: {userId: string}}>) => {
    const userStats = await userService.getUserUsageStats(request.params.userId);
    return userStats;
  });

  fastify.get('/analytics/dashboard', async (request) => {
    const today = new Date().toISOString().split('T')[0];
    const todayUsage = await userService.getDailyUsage(today);

    // Get recent queries
    const recentQueries = await userService.firestore
      .collection('queries')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    return {
      today: todayUsage,
      recentQueries: recentQueries.docs.map(doc => doc.data())
    };
  });
}
```

#### Step 7: Create Analytics UI Components (30 min)

```typescript
// apps/web/src/components/Analytics/UsageDashboard.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface UsageData {
  totalQueries: number;
  uniqueUsers: number;
  avgResponseTime: number;
  topQueries: Array<{query: string, count: number}>;
}

export function UsageDashboard() {
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const { getAuthToken } = useAuth();

  useEffect(() => {
    async function fetchUsage() {
      const token = await getAuthToken();
      const response = await fetch('/api/analytics/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setUsageData(data.today);
    }

    fetchUsage();
  }, []);

  if (!usageData) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Usage Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold">Total Queries Today</h3>
          <p className="text-3xl font-bold text-blue-600">{usageData.totalQueries}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold">Active Users</h3>
          <p className="text-3xl font-bold text-green-600">{usageData.uniqueUsers}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold">Avg Response Time</h3>
          <p className="text-3xl font-bold text-purple-600">{usageData.avgResponseTime}ms</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Top Queries</h3>
        <ul className="space-y-2">
          {usageData.topQueries?.map((item, index) => (
            <li key={index} className="flex justify-between">
              <span>{item.query}</span>
              <span className="text-gray-500">{item.count} times</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

## Updated Deployment Timeline

### Option A: Local + Basic User Management (4 hours)
- 3 hours: Local multi-tenancy
- 1 hour: Add Firestore user management

### Option B: GCP + Full Analytics (6 hours)
- 3 hours: Local multi-tenancy
- 1 hour: Deploy to GCP
- 2 hours: Add user management + analytics

### Option C: Enterprise Ready (8 hours)
- 6 hours: Option B
- 2 hours: Central management analytics + cross-tenant reporting

## Benefits of This Approach

### ✅ Perfect Tenant Isolation
- Each tenant's user data in separate Firestore
- No cross-tenant data leakage possible
- Individual billing per tenant

### ✅ Rich Analytics
- Tenant-level usage tracking
- Company-level aggregated reporting
- User behavior insights
- Cost attribution

### ✅ Minimal Complexity
- Firestore handles scaling automatically
- No additional Docker containers needed
- Managed authentication with Firebase Auth
- Real-time analytics capabilities

## Cost Impact

### Firestore Costs Per Tenant
```
Typical monthly costs:
- Document reads: $0.60 per 100K reads
- Document writes: $1.80 per 100K writes
- Storage: $0.18 per GB
- Network: $0.10 per GB

Example for 1000 queries/day:
- ~3000 reads/month: $0.02
- ~1500 writes/month: $0.03
- ~1MB storage: $0.0002
Total: ~$0.05/month per tenant
```

**Firestore is incredibly cost-effective for this use case!**

## Recommendation

**Go with Firestore** because:
1. ✅ **Serverless**: No containers to manage
2. ✅ **Cheap**: ~$0.05/month per tenant for user management
3. ✅ **Scalable**: Handles any usage level automatically
4. ✅ **Integrated**: Works perfectly with Firebase Auth
5. ✅ **Real-time**: Live analytics and dashboards
6. ✅ **Isolated**: Each tenant gets their own database

This gives you enterprise-grade user management and analytics without operational complexity or significant cost.