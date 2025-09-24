# Cloud Deployment Strategy: GCP + Firebase Multi-Tenancy

## Overview

Extend the multi-tenant architecture to support **hybrid deployment**:
- **Development**: Local Docker (as current)
- **Production**: GCP with separate projects per tenant for cost isolation and security

## Architecture: One GCP Project Per Tenant

### Cost & Security Benefits
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           GCP ORGANIZATION                                          │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      TENANT A PROJECT                                       │   │
│  │                   Project ID: rag-acme-corp                                 │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ Cloud Run   │  │ Firebase    │  │ Firestore   │  │  Cloud Storage  │   │   │
│  │  │ (API + Web) │  │ (Auth/Host) │  │ (Vector DB) │  │  (Documents)    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  │                                                                             │   │
│  │  💰 Billing: Isolated per tenant                                           │   │
│  │  🔒 IAM: Tenant-specific permissions                                       │   │
│  │  📊 Monitoring: Per-tenant dashboards                                      │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      TENANT B PROJECT                                       │   │
│  │                  Project ID: rag-client-xyz                                 │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ Cloud Run   │  │ Firebase    │  │ Firestore   │  │  Cloud Storage  │   │   │
│  │  │ (API + Web) │  │ (Auth/Host) │  │ (Vector DB) │  │  (Documents)    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  │                                                                             │   │
│  │  💰 Billing: Isolated per tenant                                           │   │
│  │  🔒 IAM: Tenant-specific permissions                                       │   │
│  │  📊 Monitoring: Per-tenant dashboards                                      │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                    MANAGEMENT PROJECT                                       │   │
│  │                 Project ID: rag-management                                  │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ Terraform   │  │ CI/CD       │  │ Monitoring  │  │  Billing Agg    │   │   │
│  │  │ State       │  │ Pipelines   │  │ Dashboard   │  │  Reports        │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack Mapping

### Development Environment (Current)
```yaml
services:
  api: "Docker container"
  web: "Docker container"
  qdrant: "Docker container"
  embeddings: "Docker container"
  storage: "Docker volumes"
  auth: "Local/mock"
```

### Production Environment (New)
```yaml
services:
  api: "Cloud Run (from same Docker image)"
  web: "Firebase Hosting"
  vector_db: "Firestore + Vector Search"
  embeddings: "Vertex AI Embeddings"
  storage: "Cloud Storage"
  auth: "Firebase Auth"
  secrets: "Secret Manager"
  monitoring: "Cloud Monitoring"
```

## Implementation Plan Extension

### Phase 7: GCP Infrastructure Setup (2 hours)

#### Step 7.1: Create Management Project (30 minutes)
```bash
# Create management project for infrastructure
gcloud projects create rag-management-$(date +%s) \
  --name="RAG Management" \
  --set-as-default

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  firebase.googleapis.com \
  firestore.googleapis.com \
  storage-component.googleapis.com \
  secretmanager.googleapis.com \
  resourcemanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com
```

#### Step 7.2: Create Terraform Infrastructure (60 minutes)

**Create [`infrastructure/terraform/tenant-project/main.tf`](infrastructure/terraform/tenant-project/main.tf)**:
```hcl
# Terraform module for creating tenant projects
variable "tenant_id" {
  description = "Unique tenant identifier"
  type        = string
}

variable "tenant_tier" {
  description = "Tenant tier (basic/premium/enterprise)"
  type        = string
  default     = "basic"
}

variable "org_id" {
  description = "GCP Organization ID"
  type        = string
}

variable "billing_account" {
  description = "Billing account ID"
  type        = string
}

# Create tenant-specific project
resource "google_project" "tenant_project" {
  name               = "RAG ${title(var.tenant_id)}"
  project_id         = "rag-${var.tenant_id}-${random_id.project_suffix.hex}"
  org_id             = var.org_id
  billing_account    = var.billing_account
  auto_create_network = false
}

resource "random_id" "project_suffix" {
  byte_length = 3
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "storage-component.googleapis.com",
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com"
  ])

  project = google_project.tenant_project.project_id
  service = each.value
}

# Create Firebase project
resource "google_firebase_project" "tenant_firebase" {
  provider = google-beta
  project  = google_project.tenant_project.project_id

  depends_on = [google_project_service.apis]
}

# Create Firestore database
resource "google_firestore_database" "tenant_db" {
  project                     = google_project.tenant_project.project_id
  name                        = "(default)"
  location_id                 = "us-central1"
  type                        = "FIRESTORE_NATIVE"
  concurrency_mode           = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"

  depends_on = [google_firebase_project.tenant_firebase]
}

# Create Cloud Storage bucket for documents
resource "google_storage_bucket" "tenant_documents" {
  name     = "${google_project.tenant_project.project_id}-documents"
  location = "US"
  project  = google_project.tenant_project.project_id

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}

# Create service account for Cloud Run
resource "google_service_account" "tenant_service_account" {
  project      = google_project.tenant_project.project_id
  account_id   = "rag-service"
  display_name = "RAG Service Account"
}

# Grant necessary permissions
resource "google_project_iam_member" "service_account_permissions" {
  for_each = toset([
    "roles/firestore.user",
    "roles/storage.admin",
    "roles/secretmanager.secretAccessor",
    "roles/aiplatform.user"
  ])

  project = google_project.tenant_project.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.tenant_service_account.email}"
}

# Create Cloud Run service for API
resource "google_cloud_run_service" "tenant_api" {
  name     = "rag-api"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    spec {
      service_account_name = google_service_account.tenant_service_account.email

      containers {
        image = "gcr.io/${google_project.tenant_project.project_id}/rag-api:latest"

        env {
          name  = "TENANT"
          value = var.tenant_id
        }

        env {
          name  = "TIER"
          value = var.tenant_tier
        }

        env {
          name  = "FIRESTORE_PROJECT"
          value = google_project.tenant_project.project_id
        }

        env {
          name  = "STORAGE_BUCKET"
          value = google_storage_bucket.tenant_documents.name
        }

        resources {
          limits = {
            cpu    = var.tenant_tier == "enterprise" ? "2" : var.tenant_tier == "premium" ? "1" : "0.5"
            memory = var.tenant_tier == "enterprise" ? "2Gi" : var.tenant_tier == "premium" ? "1Gi" : "512Mi"
          }
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Make Cloud Run service publicly accessible
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.tenant_api.name
  location = google_cloud_run_service.tenant_api.location
  project  = google_project.tenant_project.project_id
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Output important values
output "project_id" {
  value = google_project.tenant_project.project_id
}

output "api_url" {
  value = google_cloud_run_service.tenant_api.status[0].url
}

output "firebase_project" {
  value = google_firebase_project.tenant_firebase.project
}
```

#### Step 7.3: Create Deployment Scripts (30 minutes)

**Create [`scripts/cloud-deploy-tenant.sh`](scripts/cloud-deploy-tenant.sh)**:
```bash
#!/bin/bash
# Deploy tenant to GCP

set -e

TENANT_ID="$1"
TIER="${2:-basic}"
ORG_ID="${3:-your-org-id}"
BILLING_ACCOUNT="${4:-your-billing-account}"

if [[ -z "$TENANT_ID" ]]; then
    echo "Usage: $0 <tenant-id> [tier] [org-id] [billing-account]"
    exit 1
fi

echo "🚀 Deploying tenant $TENANT_ID to GCP..."

# Build and push Docker images
echo "📦 Building Docker images..."
docker build -t gcr.io/rag-management/rag-api:latest -f apps/api/Dockerfile .
docker build -t gcr.io/rag-management/rag-web:latest -f apps/web/Dockerfile .

docker push gcr.io/rag-management/rag-api:latest
docker push gcr.io/rag-management/rag-web:latest

# Create tenant project with Terraform
echo "🏗️ Creating GCP project for tenant..."
cd infrastructure/terraform/tenant-project

terraform init
terraform plan \
  -var="tenant_id=$TENANT_ID" \
  -var="tenant_tier=$TIER" \
  -var="org_id=$ORG_ID" \
  -var="billing_account=$BILLING_ACCOUNT" \
  -out="$TENANT_ID.tfplan"

terraform apply "$TENANT_ID.tfplan"

# Get project ID from Terraform output
PROJECT_ID=$(terraform output -raw project_id)
API_URL=$(terraform output -raw api_url)

echo "✅ Tenant deployed successfully!"
echo "   Project ID: $PROJECT_ID"
echo "   API URL: $API_URL"
echo "   Firebase Console: https://console.firebase.google.com/project/$PROJECT_ID"

# Update tenant registry
cd ../../../
python3 -c "
import json

# Load registry
with open('tenants/registry.json', 'r') as f:
    registry = json.load(f)

# Find and update tenant
for tenant in registry['tenants']:
    if tenant['id'] == '$TENANT_ID':
        tenant['cloud'] = {
            'project_id': '$PROJECT_ID',
            'api_url': '$API_URL',
            'status': 'deployed'
        }
        break

# Save registry
with open('tenants/registry.json', 'w') as f:
    json.dump(registry, f, indent=2)
"

echo "📋 Tenant registry updated"
```

### Phase 8: Firebase Integration (90 minutes)

#### Step 8.1: Update API for Cloud Services (45 minutes)

**Create [`apps/api/src/services/cloud-adapter.ts`](apps/api/src/services/cloud-adapter.ts)**:
```typescript
// Cloud service adapter for Firebase/GCP
import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { VectorSearchClient } from '@google-cloud/discoveryengine';

interface CloudConfig {
  projectId: string;
  isCloudEnvironment: boolean;
  firestoreEnabled: boolean;
  vertexAIEnabled: boolean;
}

export class CloudAdapter {
  private firestore?: Firestore;
  private storage?: Storage;
  private vectorSearch?: VectorSearchClient;
  private config: CloudConfig;

  constructor() {
    this.config = {
      projectId: process.env.FIRESTORE_PROJECT || '',
      isCloudEnvironment: !!process.env.FIRESTORE_PROJECT,
      firestoreEnabled: !!process.env.FIRESTORE_PROJECT,
      vertexAIEnabled: !!process.env.VERTEX_AI_ENABLED
    };

    if (this.config.isCloudEnvironment) {
      this.initializeCloudServices();
    }
  }

  private initializeCloudServices() {
    if (this.config.firestoreEnabled) {
      this.firestore = new Firestore({
        projectId: this.config.projectId
      });
    }

    this.storage = new Storage({
      projectId: this.config.projectId
    });

    if (this.config.vertexAIEnabled) {
      this.vectorSearch = new VectorSearchClient();
    }
  }

  // Store document in Firestore (alternative to Qdrant)
  async storeDocument(document: any): Promise<string> {
    if (!this.config.isCloudEnvironment) {
      throw new Error('Cloud services not configured');
    }

    const docRef = this.firestore!.collection('documents').doc();
    await docRef.set({
      ...document,
      createdAt: new Date(),
      tenantId: document.metadata.tenantId
    });

    return docRef.id;
  }

  // Search documents in Firestore
  async searchDocuments(query: string, tenantId: string): Promise<any[]> {
    if (!this.config.isCloudEnvironment) {
      throw new Error('Cloud services not configured');
    }

    // Use Firestore with vector search extension
    const results = await this.firestore!
      .collection('documents')
      .where('tenantId', '==', tenantId)
      .get();

    return results.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  // Upload file to Cloud Storage
  async uploadFile(filename: string, content: Buffer, tenantId: string): Promise<string> {
    if (!this.config.isCloudEnvironment) {
      throw new Error('Cloud services not configured');
    }

    const bucket = this.storage!.bucket(process.env.STORAGE_BUCKET!);
    const file = bucket.file(`${tenantId}/${filename}`);

    await file.save(content);

    return `gs://${process.env.STORAGE_BUCKET}/${tenantId}/${filename}`;
  }

  isCloudMode(): boolean {
    return this.config.isCloudEnvironment;
  }
}

export const cloudAdapter = new CloudAdapter();
```

#### Step 8.2: Create Firebase Configuration (30 minutes)

**Create [`apps/web/firebase.config.js`](apps/web/firebase.config.js)**:
```javascript
// Firebase configuration for web app
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// This will be set by environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase only if config is provided
let app, auth, db;

if (firebaseConfig.projectId) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
```

#### Step 8.3: Update Dockerfile for Cloud (15 minutes)

**Update [`apps/api/Dockerfile.cloud`](apps/api/Dockerfile.cloud)**:
```dockerfile
FROM node:18-slim

# Install Google Cloud SDK (for authentication)
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - \
    && echo "deb https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y google-cloud-sdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/retrieval/package.json ./packages/retrieval/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build the application
RUN npm run build -w apps/api

# Create non-root user
RUN useradd -r -s /bin/false nodejs
USER nodejs

EXPOSE 3000

# Use cloud-specific startup
CMD ["node", "apps/api/dist/server.js"]
```

### Phase 9: Hybrid Deployment Management (60 minutes)

#### Step 9.1: Create Environment Manager (30 minutes)

**Create [`scripts/environment-manager.sh`](scripts/environment-manager.sh)**:
```bash
#!/bin/bash
# Manage hybrid local/cloud deployments

ENVIRONMENT="${1:-local}"  # local or cloud
TENANT_ID="$2"
ACTION="${3:-deploy}"      # deploy, destroy, status

case "$ENVIRONMENT" in
    "local")
        case "$ACTION" in
            "deploy")
                echo "🐳 Deploying $TENANT_ID locally..."
                ./scripts/create-tenant.sh "$TENANT_ID"
                ./scripts/tenants/$TENANT_ID/start.sh
                ;;
            "destroy")
                echo "🗑️ Destroying local $TENANT_ID..."
                docker-compose --env-file ".env.$TENANT_ID" down -v
                rm -rf ".env.$TENANT_ID" "docker-compose.$TENANT_ID.yml"
                ;;
            "status")
                ./scripts/manage-tenants.sh status "$TENANT_ID"
                ;;
        esac
        ;;
    "cloud")
        case "$ACTION" in
            "deploy")
                echo "☁️ Deploying $TENANT_ID to GCP..."
                ./scripts/cloud-deploy-tenant.sh "$TENANT_ID"
                ;;
            "destroy")
                echo "🗑️ Destroying cloud $TENANT_ID..."
                cd infrastructure/terraform/tenant-project
                terraform destroy -var="tenant_id=$TENANT_ID" -auto-approve
                ;;
            "status")
                echo "☁️ Cloud status for $TENANT_ID:"
                gcloud run services list --project="$(grep $TENANT_ID tenants/registry.json | jq -r '.cloud.project_id')"
                ;;
        esac
        ;;
esac
```

#### Step 9.2: Create Cost Monitoring (30 minutes)

**Create [`scripts/cost-monitoring.sh`](scripts/cost-monitoring.sh)**:
```bash
#!/bin/bash
# Monitor costs across all tenant projects

echo "💰 Cost Summary for All Tenants"
echo "================================"

# Get all tenant projects from registry
TENANT_PROJECTS=$(python3 -c "
import json
with open('tenants/registry.json', 'r') as f:
    registry = json.load(f)
for tenant in registry['tenants']:
    if 'cloud' in tenant and 'project_id' in tenant['cloud']:
        print(tenant['cloud']['project_id'])
")

TOTAL_COST=0

for project in $TENANT_PROJECTS; do
    echo "📊 Project: $project"

    # Get current month's cost
    COST=$(gcloud billing projects link "$project" --billing-account="$BILLING_ACCOUNT" --format="value(billingAccountName)" 2>/dev/null || echo "0")

    # Get usage metrics
    CLOUD_RUN_REQUESTS=$(gcloud logging read "resource.type=cloud_run_revision" --project="$project" --limit=1 --format="value(timestamp)" | wc -l)
    FIRESTORE_READS=$(gcloud logging read "protoPayload.methodName=google.firestore.v1.Firestore.RunQuery" --project="$project" --limit=1 --format="value(timestamp)" | wc -l)

    echo "   💸 Estimated cost: $COST"
    echo "   📈 Cloud Run requests: $CLOUD_RUN_REQUESTS"
    echo "   📊 Firestore reads: $FIRESTORE_READS"
    echo ""
done

echo "💰 Total estimated cost: $TOTAL_COST"

# Create cost report
cat > "reports/cost-report-$(date +%Y%m%d).json" << EOF
{
  "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "total_cost": "$TOTAL_COST",
  "projects": [
$(for project in $TENANT_PROJECTS; do
    echo "    {\"project_id\": \"$project\", \"cost\": \"$COST\"}"
done | sed '$!s/$/,/')
  ]
}
EOF
```

## Updated Implementation Timeline

### Original Plan: 3 hours
### Extended Plan: 6 hours total

**Phase 1-6**: Local multi-tenancy (3 hours)
**Phase 7**: GCP infrastructure setup (2 hours)
**Phase 8**: Firebase integration (1.5 hours)
**Phase 9**: Hybrid management (1 hour)

## Deployment Options

### Option 1: Local Development + Cloud Production
```bash
# Develop locally
./scripts/environment-manager.sh local test-tenant deploy

# Deploy to cloud when ready
./scripts/environment-manager.sh cloud test-tenant deploy
```

### Option 2: Pure Cloud Development
```bash
# Everything in cloud from start
./scripts/cloud-deploy-tenant.sh production-client premium
```

### Option 3: Hybrid (Best of Both)
```bash
# Fast local development
./scripts/create-tenant.sh dev-tenant

# Production deployment
./scripts/cloud-deploy-tenant.sh production-client premium

# Cost monitoring
./scripts/cost-monitoring.sh
```

## Cost Benefits of Separate Projects

### Billing Isolation
- Each tenant has separate billing
- Easy cost attribution
- Granular usage tracking
- Budget alerts per tenant

### Security Isolation
- IAM policies per project
- Network isolation
- Resource quotas
- Audit logging per tenant

### Operational Benefits
- Independent scaling
- Tenant-specific monitoring
- Easier compliance (SOC2, HIPAA)
- Clean resource management

## Next Steps

1. **Start with local multi-tenancy** (Phase 1-6)
2. **Set up GCP organization** and billing
3. **Implement cloud deployment** (Phase 7-9)
4. **Test hybrid workflow**
5. **Monitor costs and optimize**

This gives you the best of both worlds: fast local development and scalable cloud production with perfect cost tracking per tenant.