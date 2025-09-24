# Automatic Subdomain Deployment

## Overview

This document outlines how to automatically deploy each tenant to their own subdomain, creating a professional multi-tenant experience where each tenant gets their own URL like `zenithfall.myrag.com`, `acme-corp.myrag.com`, etc.

## Architecture: Subdomain-Based Multi-Tenancy

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DNS & ROUTING LAYER                                    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                        Cloud DNS Zone                                       │   │
│  │                     *.myrag.com                                             │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ zenithfall      │  │ acme-corp       │  │ client-xyz                  │   │   │
│  │  │ .myrag.com      │  │ .myrag.com      │  │ .myrag.com                  │   │   │
│  │  │                 │  │                 │  │                             │   │   │
│  │  │ CNAME →         │  │ CNAME →         │  │ CNAME →                     │   │   │
│  │  │ Load Balancer   │  │ Load Balancer   │  │ Load Balancer               │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                           │
│                                        ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                       Global Load Balancer                                  │   │
│  │                     (with SSL Termination)                                  │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ Wildcard SSL    │  │ Host-based      │  │ Path Routing                │   │   │
│  │  │ *.myrag.com     │  │ Routing         │  │ to Tenant Projects          │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                           │
│                                        ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      TENANT PROJECTS                                        │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ Project A       │  │ Project B       │  │ Project C                   │   │   │
│  │  │ rag-zenithfall  │  │ rag-acme-corp   │  │ rag-client-xyz              │   │   │
│  │  │                 │  │                 │  │                             │   │   │
│  │  │ Cloud Run:      │  │ Cloud Run:      │  │ Cloud Run:                  │   │   │
│  │  │ • API Service   │  │ • API Service   │  │ • API Service               │   │   │
│  │  │ • Web Service   │  │ • Web Service   │  │ • Web Service               │   │   │
│  │  │ • Qdrant        │  │ • Qdrant        │  │ • Qdrant                    │   │   │
│  │  │ • Embeddings    │  │ • Embeddings    │  │ • Embeddings                │   │   │
│  │  │ • Firestore     │  │ • Firestore     │  │ • Firestore                 │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Strategy

### Phase 1: Domain Setup (30 minutes)

#### Step 1: Register Domain and Set Up Cloud DNS (15 minutes)

```bash
# Register your new domain (e.g., myrag.com)
# Then create Cloud DNS zone

# Create DNS zone in management project
gcloud dns managed-zones create rag-zone \
  --dns-name="myrag.com." \
  --description="RAG Multi-tenant Zone" \
  --project="rag-management"

# Get nameservers to configure with domain registrar
gcloud dns managed-zones describe rag-zone \
  --project="rag-management" \
  --format="value(nameServers)"
```

#### Step 2: Create Wildcard SSL Certificate (15 minutes)

```bash
# Create managed SSL certificate for wildcard domain
gcloud compute ssl-certificates create rag-wildcard-ssl \
  --domains="*.myrag.com,myrag.com" \
  --global \
  --project="rag-management"
```

### Phase 2: Load Balancer Setup (45 minutes)

#### Step 3: Create Global Load Balancer (30 minutes)

```bash
# Create backend service
gcloud compute backend-services create rag-backend-service \
  --global \
  --load-balancing-scheme=EXTERNAL \
  --protocol=HTTP \
  --project="rag-management"

# Create URL map
gcloud compute url-maps create rag-url-map \
  --default-backend-service=rag-backend-service \
  --global \
  --project="rag-management"

# Create HTTP(S) proxy
gcloud compute target-https-proxies create rag-https-proxy \
  --url-map=rag-url-map \
  --ssl-certificates=rag-wildcard-ssl \
  --global \
  --project="rag-management"

# Create global forwarding rule
gcloud compute forwarding-rules create rag-https-forwarding-rule \
  --target-https-proxy=rag-https-proxy \
  --ports=443 \
  --global \
  --project="rag-management"

# Get the external IP
gcloud compute forwarding-rules describe rag-https-forwarding-rule \
  --global \
  --project="rag-management" \
  --format="value(IPAddress)"
```

#### Step 4: Configure DNS A Record (15 minutes)

```bash
# Add A record for wildcard subdomain pointing to load balancer IP
LOAD_BALANCER_IP="YOUR_LOAD_BALANCER_IP"

gcloud dns record-sets transaction start \
  --zone="rag-zone" \
  --project="rag-management"

gcloud dns record-sets transaction add "$LOAD_BALANCER_IP" \
  --name="*.myrag.com." \
  --ttl=300 \
  --type=A \
  --zone="rag-zone" \
  --project="rag-management"

gcloud dns record-sets transaction execute \
  --zone="rag-zone" \
  --project="rag-management"
```

### Phase 3: Terraform Automation (60 minutes)

#### Step 5: Update Terraform for Subdomain Support (45 minutes)

```hcl
# terraform/tenant-with-subdomain/main.tf

variable "tenant_id" {
  description = "Tenant identifier"
  type        = string
}

variable "domain_name" {
  description = "Base domain name"
  type        = string
  default     = "myrag.com"
}

variable "management_project_id" {
  description = "Management project ID"
  type        = string
}

# Create tenant project (existing logic)
resource "google_project" "tenant_project" {
  name       = "RAG ${title(var.tenant_id)}"
  project_id = "rag-${var.tenant_id}-${random_id.suffix.hex}"
  billing_account = var.billing_account
}

# Deploy Cloud Run services (existing logic)
resource "google_cloud_run_service" "web" {
  name     = "rag-web"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    metadata {
      annotations = {
        "run.googleapis.com/ingress" = "all"
      }
    }
    spec {
      containers {
        image = "gcr.io/${var.management_project_id}/cw-rag-web:latest"

        env {
          name  = "TENANT_ID"
          value = var.tenant_id
        }

        env {
          name  = "API_URL"
          value = "https://${var.tenant_id}.${var.domain_name}/api"
        }

        env {
          name  = "NEXT_PUBLIC_API_URL"
          value = "https://${var.tenant_id}.${var.domain_name}/api"
        }
      }
    }
  }
}

resource "google_cloud_run_service" "api" {
  name     = "rag-api"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    spec {
      containers {
        image = "gcr.io/${var.management_project_id}/cw-rag-api:latest"

        env {
          name  = "TENANT_ID"
          value = var.tenant_id
        }

        env {
          name  = "ALLOWED_ORIGINS"
          value = "https://${var.tenant_id}.${var.domain_name}"
        }
      }
    }
  }
}

# Create Network Endpoint Group for the web service
resource "google_compute_region_network_endpoint_group" "web_neg" {
  name                  = "${var.tenant_id}-web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = "us-central1"
  project               = var.management_project_id

  cloud_run {
    service = google_cloud_run_service.web.name
  }

  depends_on = [google_cloud_run_service.web]
}

# Create Network Endpoint Group for the API service
resource "google_compute_region_network_endpoint_group" "api_neg" {
  name                  = "${var.tenant_id}-api-neg"
  network_endpoint_type = "SERVERLESS"
  region                = "us-central1"
  project               = var.management_project_id

  cloud_run {
    service = google_cloud_run_service.api.name
  }

  depends_on = [google_cloud_run_service.api]
}

# Add backend services to the global load balancer
resource "google_compute_backend_service" "web_backend" {
  name        = "${var.tenant_id}-web-backend"
  protocol    = "HTTP"
  port_name   = "http"
  timeout_sec = 30
  project     = var.management_project_id

  backend {
    group = google_compute_region_network_endpoint_group.web_neg.id
  }

  log_config {
    enable = true
  }
}

resource "google_compute_backend_service" "api_backend" {
  name        = "${var.tenant_id}-api-backend"
  protocol    = "HTTP"
  port_name   = "http"
  timeout_sec = 30
  project     = var.management_project_id

  backend {
    group = google_compute_region_network_endpoint_group.api_neg.id
  }

  log_config {
    enable = true
  }
}

# Add URL map rules for this tenant
resource "google_compute_url_map" "tenant_routing" {
  name            = "${var.tenant_id}-routing"
  default_service = google_compute_backend_service.web_backend.id
  project         = var.management_project_id

  host_rule {
    hosts        = ["${var.tenant_id}.${var.domain_name}"]
    path_matcher = "tenant-paths"
  }

  path_matcher {
    name            = "tenant-paths"
    default_service = google_compute_backend_service.web_backend.id

    path_rule {
      paths   = ["/api/*"]
      service = google_compute_backend_service.api_backend.id
    }
  }
}

# Output the tenant URL
output "tenant_url" {
  value = "https://${var.tenant_id}.${var.domain_name}"
}

output "api_url" {
  value = "https://${var.tenant_id}.${var.domain_name}/api"
}
```

#### Step 6: Create Enhanced Deployment Script (15 minutes)

```bash
#!/bin/bash
# scripts/deploy-tenant-with-subdomain.sh

TENANT_ID="$1"
TIER="${2:-basic}"
DOMAIN_NAME="${3:-myrag.com}"
MANAGEMENT_PROJECT="${4:-rag-management}"

if [[ -z "$TENANT_ID" ]]; then
    echo "Usage: $0 <tenant-id> [tier] [domain] [management-project]"
    exit 1
fi

echo "🚀 Deploying tenant $TENANT_ID with subdomain $TENANT_ID.$DOMAIN_NAME..."

# Validate tenant ID for domain compatibility
if [[ ! "$TENANT_ID" =~ ^[a-z0-9-]+$ ]]; then
    echo "❌ Tenant ID must be DNS-compatible (lowercase, numbers, hyphens only)"
    exit 1
fi

# Build and push images if needed
echo "📦 Building and pushing images..."
docker build -t gcr.io/$MANAGEMENT_PROJECT/cw-rag-web:latest -f apps/web/Dockerfile .
docker build -t gcr.io/$MANAGEMENT_PROJECT/cw-rag-api:latest -f apps/api/Dockerfile .
docker push gcr.io/$MANAGEMENT_PROJECT/cw-rag-web:latest
docker push gcr.io/$MANAGEMENT_PROJECT/cw-rag-api:latest

# Deploy with Terraform
echo "🏗️ Creating tenant infrastructure..."
cd terraform/tenant-with-subdomain

terraform init
terraform plan \
  -var="tenant_id=$TENANT_ID" \
  -var="domain_name=$DOMAIN_NAME" \
  -var="management_project_id=$MANAGEMENT_PROJECT" \
  -var="tier=$TIER" \
  -out="$TENANT_ID.tfplan"

terraform apply "$TENANT_ID.tfplan"

# Get outputs
TENANT_URL=$(terraform output -raw tenant_url)
API_URL=$(terraform output -raw api_url)

echo "✅ Tenant deployed successfully!"
echo "   🌐 Web URL: $TENANT_URL"
echo "   🔌 API URL: $API_URL"
echo "   🎯 Status: https://$TENANT_ID.$DOMAIN_NAME"

# Update tenant registry
cd ../../../
python3 -c "
import json
import os

# Load registry
with open('tenants/registry.json', 'r') as f:
    registry = json.load(f)

# Find and update tenant
for tenant in registry['tenants']:
    if tenant['id'] == '$TENANT_ID':
        tenant['urls'] = {
            'web': '$TENANT_URL',
            'api': '$API_URL',
            'subdomain': '$TENANT_ID.$DOMAIN_NAME'
        }
        tenant['status'] = 'deployed'
        break
else:
    # Add new tenant if not found
    registry['tenants'].append({
        'id': '$TENANT_ID',
        'name': '$TENANT_ID',
        'tier': '$TIER',
        'status': 'deployed',
        'urls': {
            'web': '$TENANT_URL',
            'api': '$API_URL',
            'subdomain': '$TENANT_ID.$DOMAIN_NAME'
        },
        'createdAt': '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
    })

# Save registry
with open('tenants/registry.json', 'w') as f:
    json.dump(registry, f, indent=2)
"

echo "📋 Tenant registry updated"
echo ""
echo "🎉 Tenant is now live at: $TENANT_URL"
echo "⏱️  Note: DNS propagation may take up to 5 minutes"
```

### Phase 4: Frontend Configuration (30 minutes)

#### Step 7: Update Web App for Subdomain Awareness (30 minutes)

```typescript
// apps/web/src/utils/tenant-config.ts
export function getTenantFromHostname(): string | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // Extract tenant from subdomain (e.g., zenithfall.myrag.com -> zenithfall)
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

export function getTenantConfig() {
  const tenantId = getTenantFromHostname() || process.env.NEXT_PUBLIC_TENANT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || `https://${tenantId}.myrag.com/api`;

  return {
    tenantId,
    apiUrl: baseUrl,
    isSubdomain: !!getTenantFromHostname()
  };
}

// apps/web/src/components/TenantBranding.tsx
import { useEffect, useState } from 'react';
import { getTenantConfig } from '../utils/tenant-config';

interface TenantBranding {
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function useTenantBranding() {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const { tenantId, apiUrl } = getTenantConfig();

  useEffect(() => {
    async function fetchBranding() {
      if (!tenantId) return;

      try {
        const response = await fetch(`${apiUrl}/tenant/branding`);
        const brandingData = await response.json();
        setBranding(brandingData);

        // Apply custom CSS variables for theming
        if (brandingData.primaryColor) {
          document.documentElement.style.setProperty('--primary-color', brandingData.primaryColor);
        }
        if (brandingData.secondaryColor) {
          document.documentElement.style.setProperty('--secondary-color', brandingData.secondaryColor);
        }
      } catch (error) {
        console.error('Failed to load tenant branding:', error);
      }
    }

    fetchBranding();
  }, [tenantId, apiUrl]);

  return branding;
}

// Usage in layout
export function TenantHeader() {
  const branding = useTenantBranding();
  const { tenantId } = getTenantConfig();

  return (
    <header className="bg-primary-color text-white p-4">
      <div className="flex items-center space-x-4">
        {branding?.logo && (
          <img src={branding.logo} alt={branding.name} className="h-8" />
        )}
        <h1 className="text-xl font-bold">
          {branding?.name || `${tenantId} RAG`}
        </h1>
      </div>
    </header>
  );
}
```

### Phase 5: Management Dashboard (45 minutes)

#### Step 8: Create Tenant Management Interface (45 minutes)

```typescript
// apps/management/src/components/TenantDashboard.tsx
import { useState, useEffect } from 'react';

interface Tenant {
  id: string;
  name: string;
  tier: string;
  status: string;
  urls: {
    web: string;
    api: string;
    subdomain: string;
  };
  createdAt: string;
}

export function TenantDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [newTenantId, setNewTenantId] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  useEffect(() => {
    // Load tenants from registry
    fetch('/api/tenants')
      .then(r => r.json())
      .then(data => setTenants(data.tenants));
  }, []);

  const deployNewTenant = async () => {
    if (!newTenantId) return;

    setIsDeploying(true);
    try {
      const response = await fetch('/api/tenants/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: newTenantId,
          tier: 'basic'
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTenants([...tenants, result.tenant]);
        setNewTenantId('');
        alert(`Tenant deployed! Available at: ${result.tenant.urls.web}`);
      }
    } catch (error) {
      alert('Deployment failed: ' + error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Tenant Management</h1>

      {/* Deploy New Tenant */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-semibold mb-4">Deploy New Tenant</h2>
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="tenant-id (e.g., acme-corp)"
            value={newTenantId}
            onChange={(e) => setNewTenantId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded"
          />
          <button
            onClick={deployNewTenant}
            disabled={isDeploying || !newTenantId}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isDeploying ? 'Deploying...' : 'Deploy Tenant'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Will be available at: {newTenantId}.myrag.com
        </p>
      </div>

      {/* Tenant List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Active Tenants</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subdomain
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                    <div className="text-sm text-gray-500">{tenant.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <a
                      href={tenant.urls.web}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {tenant.urls.subdomain}
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {tenant.tier}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      tenant.status === 'deployed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <a href={tenant.urls.web} target="_blank" className="text-indigo-600 hover:text-indigo-900 mr-4">
                      Visit
                    </a>
                    <button className="text-red-600 hover:text-red-900">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

## Complete Deployment Workflow

### One-Command Tenant Deployment

```bash
# Deploy new tenant with automatic subdomain
./scripts/deploy-tenant-with-subdomain.sh acme-corp premium

# Result:
# ✅ Tenant deployed at: https://acme-corp.myrag.com
# 🔌 API available at: https://acme-corp.myrag.com/api
# 🎯 Analytics: https://acme-corp.myrag.com/analytics
```

### Benefits of This Architecture

#### ✅ Professional Appearance
- Each tenant gets their own branded subdomain
- Clean, memorable URLs for clients
- Professional enterprise experience

#### ✅ Perfect Isolation
- Each tenant completely separate (GCP project + subdomain)
- Independent SSL certificates
- Isolated billing and monitoring

#### ✅ Easy Management
- Single command deploys tenant + subdomain
- Automatic DNS configuration
- Central management dashboard

#### ✅ Scalable Infrastructure
- Global load balancer handles all traffic
- Automatic SSL certificate management
- CDN and edge caching included

## Cost Breakdown

### Per-Tenant Costs
```
Monthly costs per tenant:
- Cloud Run services: $5-50
- Firestore: $0.05
- Load balancer (shared): $2-5 per tenant
- SSL certificate (shared): $0
- DNS queries: $0.40 per million
Total: $7-55 per tenant per month
```

### One-Time Setup Costs
```
Initial setup (shared across all tenants):
- Domain registration: $10-15/year
- Load balancer setup: Free
- SSL certificate: Free (Google-managed)
- DNS zone: $0.20/month
```

## Implementation Timeline

### Complete Subdomain Setup: 4 hours
- **Phase 1**: Domain + DNS setup (30 min)
- **Phase 2**: Load balancer + SSL (45 min)
- **Phase 3**: Terraform automation (60 min)
- **Phase 4**: Frontend subdomain support (30 min)
- **Phase 5**: Management dashboard (45 min)
- **Testing**: Deploy first tenant with subdomain (30 min)

## Next Steps

1. **Register domain** for your RAG product
2. **Set up DNS zone** and load balancer
3. **Deploy first tenant** with subdomain
4. **Test the complete flow** end-to-end
5. **Add management dashboard** for easy tenant deployment

**Result**: Professional multi-tenant RAG platform where you can deploy new tenants with `./deploy-tenant.sh client-name` and they instantly get their own `client-name.myrag.com` subdomain!