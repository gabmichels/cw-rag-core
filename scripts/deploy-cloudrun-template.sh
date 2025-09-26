#!/bin/bash

# Deploy RAG Stack to Google Cloud Run - Tenant Template
# This script deploys the complete docker-compose stack as Cloud Run services for any tenant

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if tenant name is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ Error: Tenant name is required${NC}"
    echo "Usage: $0 <tenant-name> [project-suffix]"
    echo "Example: $0 mycompany 123456"
    exit 1
fi

# Configuration
TENANT="$1"
PROJECT_SUFFIX="${2:-$(openssl rand -hex 3)}" # Generate random suffix if not provided
PROJECT_ID="rag-$TENANT-$PROJECT_SUFFIX"
REGION="europe-west3"  # Change to your preferred region
REGISTRY="europe-west3-docker.pkg.dev"

# Service Names (following docker-compose naming)
QDRANT_SERVICE="qdrant"
EMBEDDINGS_SERVICE="embeddings"
API_SERVICE="rag-api"
WEB_SERVICE="rag-web"

echo -e "${BLUE}🚀 Deploying $TENANT RAG Stack to Google Cloud Run${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}"
echo -e "${BLUE}Tenant: ${TENANT}${NC}"
echo ""

# Function to print step headers
print_step() {
    echo -e "${YELLOW}📋 Step $1: $2${NC}"
}

# Function to check command success
check_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1 completed successfully${NC}"
    else
        echo -e "${RED}❌ $1 failed${NC}"
        exit 1
    fi
}

# Function to generate secure token
generate_token() {
    echo "$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)"
}

# Step 0: Validate Prerequisites
print_step "0" "Validating Prerequisites"
command -v gcloud >/dev/null 2>&1 || { echo -e "${RED}❌ gcloud CLI is required but not installed${NC}"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is required but not installed${NC}"; exit 1; }
echo -e "${GREEN}✅ Prerequisites validated${NC}"

# Step 1: Create GCP Project (if it doesn't exist)
print_step "1" "Setting up GCP Project"
if ! gcloud projects describe $PROJECT_ID >/dev/null 2>&1; then
    echo "Creating new GCP project: $PROJECT_ID"
    echo -e "${YELLOW}⚠️  You'll need to provide a billing account ID${NC}"
    read -p "Enter your billing account ID: " BILLING_ACCOUNT

    gcloud projects create $PROJECT_ID --name="RAG Stack - $TENANT"
    gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT
    gcloud services enable run.googleapis.com artifactregistry.googleapis.com --project=$PROJECT_ID
fi

gcloud config set project $PROJECT_ID
check_success "Project setup"

# Step 2: Create Artifact Registry
print_step "2" "Setting up Container Registry"
if ! gcloud artifacts repositories describe rag-containers --location=$REGION >/dev/null 2>&1; then
    gcloud artifacts repositories create rag-containers \
        --repository-format=docker \
        --location=$REGION \
        --description="RAG Stack containers for $TENANT"
fi
check_success "Container registry setup"

# Step 3: Configure Docker Authentication
print_step "3" "Configuring Docker Authentication"
gcloud auth configure-docker $REGISTRY
check_success "Docker authentication"

# Step 4: Build and Push API Container
print_step "4" "Building and Pushing API Container"
echo "Building API container..."
docker build -t $REGISTRY/$PROJECT_ID/rag-containers/rag-api:latest -f apps/api/Dockerfile .
check_success "API container build"

echo "Pushing API container..."
docker push $REGISTRY/$PROJECT_ID/rag-containers/rag-api:latest
check_success "API container push"

# Step 5: Build and Push Web Container
print_step "5" "Building and Pushing Web Container"
echo "Building web container..."
docker build -t $REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest -f apps/web/Dockerfile .
check_success "Web container build"

echo "Pushing web container..."
docker push $REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest
check_success "Web container push"

# Step 6: Deploy Qdrant Service
print_step "6" "Deploying Qdrant Vector Database"
gcloud run deploy $QDRANT_SERVICE \
  --image=qdrant/qdrant:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=6333 \
  --memory=2Gi \
  --cpu=1 \
  --max-instances=5 \
  --set-env-vars="QDRANT__STORAGE__STORAGE_PATH=/qdrant/data" \
  --project=$PROJECT_ID
check_success "Qdrant deployment"

QDRANT_URL=$(gcloud run services describe $QDRANT_SERVICE --region=$REGION --format="value(status.url)" --project=$PROJECT_ID)
echo -e "${GREEN}Qdrant URL: $QDRANT_URL${NC}"

# Step 7: Deploy Embeddings Service
print_step "7" "Deploying Embeddings Service"
echo "Pulling and retagging embeddings image..."
docker pull ghcr.io/huggingface/text-embeddings-inference:cpu-1.8
docker tag ghcr.io/huggingface/text-embeddings-inference:cpu-1.8 $REGISTRY/$PROJECT_ID/rag-containers/embeddings:latest
docker push $REGISTRY/$PROJECT_ID/rag-containers/embeddings:latest
check_success "Embeddings image preparation"

gcloud run deploy $EMBEDDINGS_SERVICE \
  --image=$REGISTRY/$PROJECT_ID/rag-containers/embeddings:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=80 \
  --memory=8Gi \
  --cpu=4 \
  --max-instances=3 \
  --timeout=900 \
  --no-cpu-throttling \
  --set-env-vars="MODEL_ID=BAAI/bge-small-en-v1.5,REVISION=main,MAX_CONCURRENT_REQUESTS=512,MAX_BATCH_TOKENS=65536,MAX_BATCH_REQUESTS=1024,MAX_CLIENT_BATCH_SIZE=32" \
  --project=$PROJECT_ID
check_success "Embeddings deployment"

EMBEDDINGS_URL=$(gcloud run services describe $EMBEDDINGS_SERVICE --region=$REGION --format="value(status.url)" --project=$PROJECT_ID)
echo -e "${GREEN}Embeddings URL: $EMBEDDINGS_URL${NC}"

# Generate secure ingest token
INGEST_TOKEN=$(generate_token)

# Step 8: Deploy API Service
print_step "8" "Deploying API Service"
gcloud run deploy $API_SERVICE \
  --image=$REGISTRY/$PROJECT_ID/rag-containers/rag-api:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=4Gi \
  --cpu=2 \
  --max-instances=10 \
  --timeout=900 \
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,QDRANT_URL=$QDRANT_URL,QDRANT_COLLECTION=docs_v1,CORS_ORIGIN=https://$PROJECT_ID.web.app,TENANT=$TENANT,VECTOR_DIM=384,PII_POLICY=strict,EMBEDDINGS_PROVIDER=huggingface,EMBEDDINGS_MODEL=BAAI/bge-small-en-v1.5,EMBEDDINGS_URL=$EMBEDDINGS_URL,LLM_ENABLED=true,LLM_PROVIDER=openai,LLM_MODEL=gpt-4-1106-preview,LLM_STREAMING=true,LLM_TIMEOUT_MS=25000,ANSWERABILITY_THRESHOLD=0.01,VECTOR_SEARCH_TIMEOUT_MS=8000,KEYWORD_SEARCH_TIMEOUT_MS=5000,RERANKER_TIMEOUT_MS=15000,OVERALL_TIMEOUT_MS=60000,EMBEDDING_TIMEOUT_MS=8000,RATE_LIMIT_PER_IP=100,RATE_LIMIT_PER_USER=1000,RATE_LIMIT_PER_TENANT=10000,RATE_LIMIT_WINDOW_MINUTES=1,INGEST_TOKEN=$INGEST_TOKEN,FUSION_STRATEGY=weighted_average,FUSION_NORMALIZATION=none,FUSION_K_PARAM=1,FUSION_DEBUG_TRACE=on,HYBRID_VECTOR_WEIGHT=0.7,HYBRID_KEYWORD_WEIGHT=0.3,QUERY_ADAPTIVE_WEIGHTS=on" \
  --project=$PROJECT_ID
check_success "API deployment"

API_URL=$(gcloud run services describe $API_SERVICE --region=$REGION --format="value(status.url)" --project=$PROJECT_ID)
echo -e "${GREEN}API URL: $API_URL${NC}"

# Step 9: Deploy Web Service
print_step "9" "Deploying Web Service"
gcloud run deploy $WEB_SERVICE \
  --image=$REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=2Gi \
  --cpu=1 \
  --max-instances=10 \
  --set-env-vars="API_URL=$API_URL,NEXT_PUBLIC_API_URL=$API_URL,TENANT=$TENANT,HOSTNAME=0.0.0.0,NEXT_TELEMETRY_DISABLED=1,NEXT_PUBLIC_TENANT_BRAND_NAME=$TENANT RAG,NEXT_PUBLIC_TENANT_LOGO_URL=/logos/$TENANT-logo.png,NEXT_PUBLIC_TENANT_PRIMARY_COLOR=#059669,NEXT_PUBLIC_TENANT_SECONDARY_COLOR=#10b981,NEXT_PUBLIC_TENANT_THEME=production" \
  --project=$PROJECT_ID
check_success "Web deployment"

WEB_URL=$(gcloud run services describe $WEB_SERVICE --region=$REGION --format="value(status.url)" --project=$PROJECT_ID)
echo -e "${GREEN}Web URL: $WEB_URL${NC}"

# Step 10: Health Check
print_step "10" "Running Health Checks"
echo "Waiting for services to be ready..."
sleep 30

echo "Testing Qdrant..."
curl -s "$QDRANT_URL/collections" > /dev/null && echo -e "${GREEN}✅ Qdrant: Healthy${NC}" || echo -e "${RED}❌ Qdrant: Failed${NC}"

echo "Testing API..."
API_HEALTH=$(curl -s "$API_URL/healthz" | grep -o '"status":"ok"' || echo "failed")
if [ "$API_HEALTH" = '"status":"ok"' ]; then
    echo -e "${GREEN}✅ API: Healthy${NC}"
else
    echo -e "${RED}❌ API: Failed${NC}"
fi

echo "Testing Web..."
WEB_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL")
if [ "$WEB_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Web: Healthy${NC}"
else
    echo -e "${RED}❌ Web: Failed (HTTP $WEB_HEALTH)${NC}"
fi

# Final Summary
echo ""
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}Your $TENANT RAG Stack is now running on Google Cloud Run:${NC}"
echo ""
echo -e "${BLUE}📊 Service URLs:${NC}"
echo -e "  🔍 Qdrant:     $QDRANT_URL"
echo -e "  🧠 Embeddings: $EMBEDDINGS_URL"
echo -e "  🔌 API:        $API_URL"
echo -e "  🌐 Web App:    $WEB_URL"
echo ""
echo -e "${YELLOW}🌟 Visit your application: $WEB_URL${NC}"
echo -e "${YELLOW}🔑 Ingest Token: $INGEST_TOKEN${NC}"
echo ""

# Save deployment configuration
cat > deployments/$TENANT-cloudrun-config.txt << EOF
# $TENANT RAG Stack - Cloud Run Deployment
# Generated: $(date)

PROJECT_ID=$PROJECT_ID
REGION=$REGION
TENANT=$TENANT
INGEST_TOKEN=$INGEST_TOKEN

# Service URLs
QDRANT_URL=$QDRANT_URL
EMBEDDINGS_URL=$EMBEDDINGS_URL
API_URL=$API_URL
WEB_URL=$WEB_URL

# Docker Images
QDRANT_IMAGE=qdrant/qdrant:latest
EMBEDDINGS_IMAGE=$REGISTRY/$PROJECT_ID/rag-containers/embeddings:latest
API_IMAGE=$REGISTRY/$PROJECT_ID/rag-containers/rag-api:latest
WEB_IMAGE=$REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest

# Quick Commands
# View logs: gcloud logging read "resource.type=cloud_run_revision" --project=$PROJECT_ID
# List services: gcloud run services list --region=$REGION --project=$PROJECT_ID
# Update service: gcloud run services update SERVICE_NAME --region=$REGION --project=$PROJECT_ID
EOF

mkdir -p deployments
echo -e "${GREEN}📝 Deployment configuration saved to deployments/$TENANT-cloudrun-config.txt${NC}"

echo ""
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo -e "1. Set your OpenAI API key in the API service environment variables"
echo -e "2. Upload documents using the ingest token: $INGEST_TOKEN"
echo -e "3. Test the complete stack by asking questions in the web interface"
echo -e "4. Configure custom domain (optional)"
echo ""
echo -e "${GREEN}🚀 Your RAG stack is ready to use!${NC}"