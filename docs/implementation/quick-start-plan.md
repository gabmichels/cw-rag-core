# Quick Start: Local Multi-Tenancy + Cloud Deployment

## 🎯 Your Requirements Addressed

✅ **Keep current local setup** - Test Docker containers locally
✅ **Deploy exact same containers to cloud** - No code changes
✅ **Each tenant gets modified Next.js webserver** - Whitelabeling support
✅ **You have Firebase/GCP project ready** - Leverage existing setup

## 🚀 3-Step Quick Start Plan

### Step 1: Activate Local Multi-Tenancy (2 hours)
**Goal**: Get multiple tenants running locally with your existing containers

#### 1.1 Fix and Test Scripts (30 min)
```bash
# Make scripts executable
chmod +x scripts/create-tenant.sh
chmod +x scripts/manage-tenants.sh

# Test with your current setup
./scripts/manage-tenants.sh list
```

#### 1.2 Create Second Tenant (30 min)
```bash
# Create a test tenant
./scripts/create-tenant.sh test-client --tier basic --api-port 3100

# Start both tenants
./scripts/manage-tenants.sh start zenithfall
./scripts/tenants/test-client/start.sh

# Verify isolation
curl http://localhost:3000/healthz  # zenithfall
curl http://localhost:3100/healthz  # test-client
```

#### 1.3 Test Data Isolation (1 hour)
```bash
# Ingest documents for each tenant
curl -X POST http://localhost:3000/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: zenithfall-secure-token-2024" \
  -d '{
    "content": "Zenithfall confidential data",
    "metadata": {"tenantId": "zenithfall", "docId": "test-001"}
  }'

curl -X POST http://localhost:3100/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: test-client-secure-token-2024" \
  -d '{
    "content": "Test client confidential data",
    "metadata": {"tenantId": "test-client", "docId": "test-001"}
  }'

# Verify cross-tenant isolation
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "confidential", "userContext": {"tenantId": "zenithfall"}}'
# Should only return zenithfall documents
```

### Step 2: Deploy to GCP (1 hour)
**Goal**: Deploy your exact same containers to your existing GCP project

#### 2.1 Build and Push Images (20 min)
```bash
# Build your current containers
docker build -t gcr.io/YOUR_PROJECT/cw-rag-api:latest -f apps/api/Dockerfile .
docker build -t gcr.io/YOUR_PROJECT/cw-rag-web:latest -f apps/web/Dockerfile .
docker build -t gcr.io/YOUR_PROJECT/cw-rag-qdrant:latest -f Dockerfile.qdrant .
docker build -t gcr.io/YOUR_PROJECT/cw-rag-embeddings:latest -f Dockerfile.embeddings .

# Push to Google Container Registry
gcloud auth configure-docker
docker push gcr.io/YOUR_PROJECT/cw-rag-api:latest
docker push gcr.io/YOUR_PROJECT/cw-rag-web:latest
docker push gcr.io/YOUR_PROJECT/cw-rag-qdrant:latest
docker push gcr.io/YOUR_PROJECT/cw-rag-embeddings:latest
```

#### 2.2 Deploy to Cloud Run (40 min)
```bash
# Deploy API service
gcloud run deploy cw-rag-api \
  --image gcr.io/YOUR_PROJECT/cw-rag-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="TENANT=zenithfall"

# Deploy Web service
gcloud run deploy cw-rag-web \
  --image gcr.io/YOUR_PROJECT/cw-rag-web:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="TENANT=zenithfall"

# Deploy Qdrant
gcloud run deploy cw-rag-qdrant \
  --image gcr.io/YOUR_PROJECT/cw-rag-qdrant:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=1

# Deploy Embeddings
gcloud run deploy cw-rag-embeddings \
  --image gcr.io/YOUR_PROJECT/cw-rag-embeddings:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=1Gi
```

### Step 3: Add Whitelabeling Support (2 hours)
**Goal**: Each tenant gets their own branded Next.js webserver

#### 3.1 Create Whitelabeling System (1 hour)

**Create [`packages/shared/src/types/branding.ts`](packages/shared/src/types/branding.ts)**:
```typescript
export interface TenantBranding {
  tenantId: string;
  name: string;
  logo?: {
    url: string;
    alt: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  customCss?: string;
  features: {
    showPoweredBy: boolean;
    customFooter?: string;
    analytics?: {
      googleAnalyticsId?: string;
      mixpanelToken?: string;
    };
  };
}
```

**Create [`packages/shared/src/services/branding.ts`](packages/shared/src/services/branding.ts)**:
```typescript
import { TenantBranding } from '../types/branding';

export class BrandingService {
  private static instance: BrandingService;
  private brandingCache = new Map<string, TenantBranding>();

  static getInstance(): BrandingService {
    if (!BrandingService.instance) {
      BrandingService.instance = new BrandingService();
    }
    return BrandingService.instance;
  }

  async getBranding(tenantId: string): Promise<TenantBranding> {
    if (this.brandingCache.has(tenantId)) {
      return this.brandingCache.get(tenantId)!;
    }

    // Default branding
    const defaultBranding: TenantBranding = {
      tenantId,
      name: tenantId,
      colors: {
        primary: '#3B82F6',
        secondary: '#64748B',
        accent: '#10B981',
        background: '#FFFFFF',
        text: '#1F2937'
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif'
      },
      features: {
        showPoweredBy: true
      }
    };

    // In production, load from Firestore/database
    // For now, return defaults
    this.brandingCache.set(tenantId, defaultBranding);
    return defaultBranding;
  }

  async updateBranding(tenantId: string, branding: Partial<TenantBranding>): Promise<void> {
    const current = await this.getBranding(tenantId);
    const updated = { ...current, ...branding };
    this.brandingCache.set(tenantId, updated);

    // In production, save to database
  }
}

export const brandingService = BrandingService.getInstance();
```

#### 3.2 Update Next.js Layout for Whitelabeling (1 hour)

**Update [`apps/web/src/app/layout.tsx`](apps/web/src/app/layout.tsx)**:
```typescript
import { Inter } from 'next/font/google';
import { brandingService } from '@cw-rag-core/shared';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get tenant from environment or hostname
  const tenantId = process.env.TENANT || 'zenithfall';
  const branding = await brandingService.getBranding(tenantId);

  return (
    <html lang="en">
      <head>
        <title>{branding.name} - RAG Assistant</title>
        <meta name="description" content={`AI-powered assistant for ${branding.name}`} />
        <link rel="icon" href={branding.logo?.url || "/favicon.ico"} />

        {/* Dynamic CSS variables for theming */}
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --primary-color: ${branding.colors.primary};
              --secondary-color: ${branding.colors.secondary};
              --accent-color: ${branding.colors.accent};
              --background-color: ${branding.colors.background};
              --text-color: ${branding.colors.text};
              --heading-font: ${branding.fonts.heading};
              --body-font: ${branding.fonts.body};
            }
            body {
              font-family: var(--body-font);
              background-color: var(--background-color);
              color: var(--text-color);
            }
            h1, h2, h3, h4, h5, h6 {
              font-family: var(--heading-font);
            }
            ${branding.customCss || ''}
          `
        }} />

        {/* Analytics */}
        {branding.features.analytics?.googleAnalyticsId && (
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${branding.features.analytics.googleAnalyticsId}`}></script>
        )}
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)]">
          {children}

          {/* Custom footer */}
          {branding.features.customFooter && (
            <footer className="mt-8 p-4 text-center text-sm opacity-75">
              <div dangerouslySetInnerHTML={{ __html: branding.features.customFooter }} />
            </footer>
          )}

          {/* Powered by */}
          {branding.features.showPoweredBy && (
            <footer className="mt-4 p-4 text-center text-xs opacity-50">
              Powered by cw-rag-core
            </footer>
          )}
        </div>
      </body>
    </html>
  );
}
```

**Update [`apps/web/src/components/Navigation.tsx`](apps/web/src/components/Navigation.tsx)**:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { brandingService, TenantBranding } from '@cw-rag-core/shared';

export function Navigation() {
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    const loadBranding = async () => {
      const tenantId = process.env.NEXT_PUBLIC_TENANT || 'zenithfall';
      const brandingData = await brandingService.getBranding(tenantId);
      setBranding(brandingData);
    };

    loadBranding();
  }, []);

  if (!branding) return null;

  return (
    <nav className="bg-[var(--primary-color)] text-white p-4">
      <div className="flex items-center space-x-4">
        {branding.logo && (
          <img
            src={branding.logo.url}
            alt={branding.logo.alt}
            className="h-8 w-auto"
          />
        )}
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--heading-font)' }}>
          {branding.name}
        </h1>
      </div>
    </nav>
  );
}
```

## 🎯 Success Criteria

After these 3 steps, you'll have:

### ✅ Local Multi-Tenancy
- Multiple tenants running locally with perfect isolation
- Same containers work for development and testing
- Data never mixes between tenants

### ✅ Cloud Deployment
- Exact same containers running on GCP Cloud Run
- No code changes required for cloud deployment
- Your existing Firebase/GCP project utilized

### ✅ Whitelabeling Ready
- Each tenant can have custom branding
- Dynamic theming system in place
- Foundation for custom features per tenant

## 🚀 Next Steps (Optional)

Once you have the basics working, you can add:

1. **User Management** - Add Firebase Auth + Firestore users
2. **Analytics** - Track usage per tenant
3. **Subdomains** - Automatic `tenant.yourdomain.com` deployment
4. **Separate Projects** - One GCP project per tenant for cost tracking

## 💡 Why This Approach Works

- **Start Small**: Focus on getting multi-tenancy working locally first
- **Zero Risk**: Deploy exact same containers to cloud
- **Maintainable**: Keep your current development workflow
- **Scalable**: Foundation for advanced features later
- **Professional**: Whitelabeling makes each tenant feel custom

**Ready to start? Begin with Step 1.1 - make the scripts executable and test your current setup!**