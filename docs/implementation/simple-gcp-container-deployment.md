# Simple GCP Container Deployment Strategy

## Overview

**YES, you can absolutely deploy your existing containers as-is to GCP!** You don't need to replace Qdrant with Firestore or change any of your technology stack. This document outlines the simplest path to get your current Docker setup running on GCP with separate projects per tenant.

## Two Deployment Approaches

### Approach 1: Direct Container Deployment (SIMPLE)
**Keep everything the same, just run on GCP**
- ✅ Use your existing Qdrant, BGE embeddings, Fastify API
- ✅ Deploy same Docker containers to Cloud Run or GKE
- ✅ Zero code changes required
- ✅ Separate GCP project per tenant for cost tracking

### Approach 2: Google Services Integration (COMPLEX)
**Replace components with Google equivalents**
- 🔄 Replace Qdrant with Firestore + Vector Search
- 🔄 Replace BGE with Vertex AI Embeddings
- 🔄 Add Firebase Auth
- 🔄 Requires code changes and adaptation

## Recommended: Start with Approach 1

### Architecture: Same Containers, Cloud Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           GCP PROJECT PER TENANT                                    │
│                                                                                     │
│  Local Development          │         GCP Production                               │
│  ┌─────────────────────┐   │    ┌─────────────────────────────────────────────┐   │
│  │ Docker Compose      │   │    │ GCP Cloud Run / GKE                        │   │
│  │                     │   │    │                                             │   │
│  │ ┌─────────────────┐ │   │    │ ┌─────────────────┐ ┌─────────────────────┐ │   │
│  │ │ Fastify API     │ │ ──┼──► │ │ Fastify API     │ │ Next.js Web         │ │   │
│  │ │ Container       │ │   │    │ │ Cloud Run       │ │ Cloud Run           │ │   │
│  │ └─────────────────┘ │   │    │ └─────────────────┘ └─────────────────────┘ │   │
│  │                     │   │    │                                             │   │
│  │ ┌─────────────────┐ │   │    │ ┌─────────────────┐ ┌─────────────────────┐ │   │
│  │ │ Next.js Web     │ │   │    │ │ Qdrant Vector   │ │ BGE Embeddings      │ │   │
│  │ │ Container       │ │   │    │ │ Cloud Run       │ │ Cloud Run           │ │   │
│  │ └─────────────────┘ │   │    │ └─────────────────┘ └─────────────────────┘ │   │
│  │                     │   │    │                                             │   │
│  │ ┌─────────────────┐ │   │    │ ┌─────────────────────────────────────────┐ │   │
│  │ │ Qdrant DB       │ │   │    │ │ Cloud Storage + Persistent Disks        │ │   │
│  │ │ Container       │ │   │    │ │ (for Qdrant data)                       │ │   │
│  │ └─────────────────┘ │   │    │ └─────────────────────────────────────────┘ │   │
│  │                     │   │    │                                             │   │
│  │ ┌─────────────────┐ │   │    │ 💰 Project Billing: Isolated per tenant    │   │
│  │ │ BGE Embeddings  │ │   │    │ 📊 Monitoring: Per-tenant dashboards       │   │
│  │ │ Container       │ │   │    │ 🔒 IAM: Tenant-specific permissions        │   │
│  │ └─────────────────┘ │   │    │                                             │   │
│  └─────────────────────┘   │    └─────────────────────────────────────────────┘   │
│                            │                                                      │
│  SAME CODE, SAME IMAGES ───┼───► SAME CODE, SAME IMAGES                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Simple GCP Deployment Steps

### Step 1: Build and Push Your Existing Images (10 minutes)

```bash
# Build your current Docker images
docker build -t gcr.io/your-project/cw-rag-api:latest -f apps/api/Dockerfile .
docker build -t gcr.io/your-project/cw-rag-web:latest -f apps/web/Dockerfile .
docker build -t gcr.io/your-project/cw-rag-qdrant:latest -f Dockerfile.qdrant .
docker build -t gcr.io/your-project/cw-rag-embeddings:latest -f Dockerfile.embeddings .

# Push to Google Container Registry
gcloud auth configure-docker
docker push gcr.io/your-project/cw-rag-api:latest
docker push gcr.io/your-project/cw-rag-web:latest
docker push gcr.io/your-project/cw-rag-qdrant:latest
docker push gcr.io/your-project/cw-rag-embeddings:latest
```

### Step 2: Create GCP Project for Tenant (5 minutes)

```bash
# Create tenant project
gcloud projects create rag-acme-corp-$(date +%s) \
  --name="RAG ACME Corp" \
  --set-as-default

# Enable Cloud Run
gcloud services enable run.googleapis.com
```

### Step 3: Deploy to Cloud Run (15 minutes)

```bash
# Deploy API service (same container as local)
gcloud run deploy rag-api \
  --image gcr.io/your-project/cw-rag-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="TENANT=acme-corp,QDRANT_URL=https://rag-qdrant-xyz-uc.a.run.app"

# Deploy Web service
gcloud run deploy rag-web \
  --image gcr.io/your-project/cw-rag-web:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="API_URL=https://rag-api-xyz-uc.a.run.app"

# Deploy Qdrant service
gcloud run deploy rag-qdrant \
  --image gcr.io/your-project/cw-rag-qdrant:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=1

# Deploy Embeddings service
gcloud run deploy rag-embeddings \
  --image gcr.io/your-project/cw-rag-embeddings:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory=1Gi
```

**That's it! Your tenant is running on GCP with the same code.**

## Persistence for Qdrant Data

### Option A: Cloud Storage Mounting (Simple)
```bash
# Create storage bucket for Qdrant data
gsutil mb gs://rag-acme-corp-qdrant-data

# Mount as volume in Cloud Run (when available) or use GKE
```

### Option B: Persistent Disks with GKE (More robust)
```yaml
# kubernetes/qdrant-deployment.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qdrant-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qdrant
spec:
  template:
    spec:
      containers:
      - name: qdrant
        image: gcr.io/your-project/cw-rag-qdrant:latest
        volumeMounts:
        - name: qdrant-data
          mountPath: /qdrant/data
      volumes:
      - name: qdrant-data
        persistentVolumeClaim:
          claimName: qdrant-data
```

## Automated Terraform for Simple Deployment

```hcl
# terraform/simple-tenant/main.tf
variable "tenant_id" {
  description = "Tenant identifier"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag"
  type        = string
  default     = "latest"
}

# Create GCP project
resource "google_project" "tenant_project" {
  name       = "RAG ${title(var.tenant_id)}"
  project_id = "rag-${var.tenant_id}-${random_id.suffix.hex}"
  billing_account = var.billing_account
}

resource "random_id" "suffix" {
  byte_length = 3
}

# Enable Cloud Run
resource "google_project_service" "cloud_run" {
  project = google_project.tenant_project.project_id
  service = "run.googleapis.com"
}

# Deploy your existing API container
resource "google_cloud_run_service" "api" {
  name     = "rag-api"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    spec {
      containers {
        image = "gcr.io/your-management-project/cw-rag-api:${var.image_tag}"

        env {
          name  = "TENANT"
          value = var.tenant_id
        }

        env {
          name  = "QDRANT_URL"
          value = "https://${google_cloud_run_service.qdrant.status[0].url}"
        }
      }
    }
  }
}

# Deploy your existing Qdrant container
resource "google_cloud_run_service" "qdrant" {
  name     = "rag-qdrant"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    spec {
      containers {
        image = "gcr.io/your-management-project/cw-rag-qdrant:${var.image_tag}"

        resources {
          limits = {
            memory = "2Gi"
            cpu    = "1000m"
          }
        }
      }
    }
  }
}

# Deploy your existing Web container
resource "google_cloud_run_service" "web" {
  name     = "rag-web"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    spec {
      containers {
        image = "gcr.io/your-management-project/cw-rag-web:${var.image_tag}"

        env {
          name  = "API_URL"
          value = google_cloud_run_service.api.status[0].url
        }
      }
    }
  }
}

# Deploy your existing Embeddings container
resource "google_cloud_run_service" "embeddings" {
  name     = "rag-embeddings"
  location = "us-central1"
  project  = google_project.tenant_project.project_id

  template {
    spec {
      containers {
        image = "gcr.io/your-management-project/cw-rag-embeddings:${var.image_tag}"

        resources {
          limits = {
            memory = "1Gi"
            cpu    = "1000m"
          }
        }
      }
    }
  }
}
```

## Simple Deployment Script

```bash
#!/bin/bash
# scripts/simple-cloud-deploy.sh

TENANT_ID="$1"
IMAGE_TAG="${2:-latest}"

if [[ -z "$TENANT_ID" ]]; then
    echo "Usage: $0 <tenant-id> [image-tag]"
    exit 1
fi

echo "🚀 Deploying $TENANT_ID to GCP using existing containers..."

# Deploy with Terraform
cd terraform/simple-tenant
terraform init
terraform apply \
  -var="tenant_id=$TENANT_ID" \
  -var="image_tag=$IMAGE_TAG" \
  -auto-approve

# Get URLs
API_URL=$(terraform output -raw api_url)
WEB_URL=$(terraform output -raw web_url)
PROJECT_ID=$(terraform output -raw project_id)

echo "✅ Deployment complete!"
echo "   Project: $PROJECT_ID"
echo "   Web App: $WEB_URL"
echo "   API: $API_URL"
echo "   💰 Billing: Isolated to this project"
```

## Benefits of Simple Container Approach

### ✅ Advantages
- **Zero code changes**: Deploy exactly what you have locally
- **Familiar stack**: Keep Qdrant, BGE, Fastify - no learning curve
- **Fast deployment**: 30 minutes from decision to live tenant
- **Cost isolation**: Still get separate billing per tenant
- **Easy rollback**: Same containers work locally if issues
- **Gradual migration**: Can add Google services later if desired

### ⚠️ Considerations
- **Managed services**: Miss out on some Google managed service benefits
- **Scaling**: Need to handle container scaling yourself
- **Storage**: Need persistent storage solution for Qdrant data
- **Authentication**: May want to add Google Auth later

## Migration Path

### Phase 1: Simple Container Deployment (Week 1)
```bash
# Deploy existing containers as-is
./scripts/simple-cloud-deploy.sh acme-corp
```

### Phase 2: Add Google Services Gradually (Optional)
```bash
# Later, if desired, migrate specific components:
# - Add Firebase Auth
# - Replace Qdrant with Firestore + Vector Search
# - Use Vertex AI for embeddings
```

## Cost Comparison

### Simple Container Deployment
```
Per tenant per month:
- Cloud Run API: $5-30 (based on requests)
- Cloud Run Web: $2-10 (based on requests)
- Cloud Run Qdrant: $10-50 (always running + storage)
- Cloud Run Embeddings: $5-20 (based on usage)
- Persistent Storage: $5-20 (based on data size)
Total: $27-130/month per tenant
```

### Full Google Services
```
Per tenant per month:
- Cloud Run: $5-30
- Firestore: $1-25
- Cloud Storage: $1-10
- Firebase Hosting: $0-5
- Vertex AI: $5-50
Total: $12-120/month per tenant
```

## Quick Start: Deploy Your First Cloud Tenant Today

```bash
# 1. Build and push your existing images (10 min)
docker build -t gcr.io/your-project/cw-rag-api:latest -f apps/api/Dockerfile .
docker push gcr.io/your-project/cw-rag-api:latest

# 2. Deploy to GCP (20 min)
./scripts/simple-cloud-deploy.sh test-client

# 3. Test it works (5 min)
curl https://rag-api-xyz-uc.a.run.app/healthz
```

**Result**: Your existing RAG system running on GCP with isolated billing, zero code changes required!

## Recommendation

**Start with Simple Container Deployment** because:
1. ✅ **No risk**: Same code that works locally
2. ✅ **Fast**: Deploy in 30 minutes
3. ✅ **Cost isolation**: Separate project billing
4. ✅ **Familiar**: Keep your current stack
5. ✅ **Flexible**: Can add Google services later

**Add Google Services later** when you need:
- Serverless vector database
- Advanced AI/ML features
- Zero-ops managed services
- Tighter GCP ecosystem integration

**You can absolutely just lift your existing containers to GCP and get all the benefits of separate project billing without changing a single line of code!**