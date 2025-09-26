#!/bin/bash
# Deploy Zenithfall RAG Stack to Google Cloud Run
# This script deploys the complete docker-compose.zenithfall.yml stack as Cloud Run services
# Updated to use GCP Secret Manager for sensitive data

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="rag-zenithfall-827ad2"
REGION="europe-west3"
REGISTRY="europe-west3-docker.pkg.dev"
TENANT="zenithfall"

# Service Names (following docker-compose naming)
QDRANT_SERVICE="qdrant"
EMBEDDINGS_SERVICE="embeddings"
API_SERVICE="rag-api"
WEB_SERVICE="rag-web"

echo -e "${BLUE}🚀 Deploying Zenithfall RAG Stack to Google Cloud Run${NC}"
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required tools
check_prerequisites() {
    print_status "Checking prerequisites..."

    local missing_tools=()

    if ! command_exists gcloud; then
        missing_tools+=("gcloud")
    fi

    if ! command_exists docker; then
        missing_tools+=("docker")
    fi

    if ! command_exists pnpm; then
        missing_tools+=("pnpm")
    fi

    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_error "Please install the missing tools and try again."
        exit 1
    fi

    print_success "All prerequisites met"
}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to validate project access
validate_project_access() {
    print_status "Validating GCP project access..."

    # Check if we can access the project
    if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
        print_error "Cannot access GCP project: $PROJECT_ID"
        print_error "Please check:"
        print_error "1. The project ID is correct"
        print_error "2. You have access to the project"
        print_error "3. You are authenticated with gcloud (run: gcloud auth login)"
        exit 1
    fi

    print_success "Project access validated: $PROJECT_ID"
}

# Function to deploy infrastructure with Terraform (minimal)
deploy_infrastructure() {
    print_status "Setting up GCP infrastructure..."

    # Set region for use in other functions
    export REGION="europe-west3"

    print_success "Infrastructure setup completed"
}

# Function to build and deploy all services
deploy_services() {
    print_status "Building and deploying all services..."

    # Step 1: Set GCP Project
    print_step "1" "Setting GCP Project"
    gcloud config set project $PROJECT_ID
    check_success "Project configuration"

    # Step 2: Configure Docker Authentication
    print_step "2" "Configuring Docker Authentication"
    gcloud auth configure-docker $REGISTRY
    check_success "Docker authentication"

    # Step 3: Build and Push API Container
    print_step "3" "Building and Pushing API Container"
    echo "Building API container..."
    docker build -t $REGISTRY/$PROJECT_ID/rag-containers/rag-api:latest -f apps/api/Dockerfile .
    check_success "API container build"

    echo "Pushing API container..."
    docker push $REGISTRY/$PROJECT_ID/rag-containers/rag-api:latest
    check_success "API container push"

    # Step 4: Build and Push Web Container
    print_step "4" "Building and Pushing Web Container"
    echo "Building web container..."
    docker build -t $REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest -f apps/web/Dockerfile .
    check_success "Web container build"

    echo "Pushing web container..."
    docker push $REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest
    check_success "Web container push"

    # Step 5: Deploy Qdrant Service
    print_step "5" "Deploying Qdrant Vector Database"
    gcloud run deploy $QDRANT_SERVICE \
      --image=qdrant/qdrant:latest \
      --region=$REGION \
      --platform=managed \
      --allow-unauthenticated \
      --port=6333 \
      --memory=2Gi \
      --cpu=1 \
      --max-instances=5 \
      --set-env-vars="QDRANT__STORAGE__STORAGE_PATH=/qdrant/data"
    check_success "Qdrant deployment"

    QDRANT_URL=$(gcloud run services describe $QDRANT_SERVICE --region=$REGION --format="value(status.url)")
    echo -e "${GREEN}Qdrant URL: $QDRANT_URL${NC}"

    # Step 6: Deploy Embeddings Service
    print_step "6" "Deploying Embeddings Service"
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
      --set-env-vars="MODEL_ID=BAAI/bge-small-en-v1.5,REVISION=main,MAX_CONCURRENT_REQUESTS=512,MAX_BATCH_TOKENS=65536,MAX_BATCH_REQUESTS=1024,MAX_CLIENT_BATCH_SIZE=32"
    check_success "Embeddings deployment"

    EMBEDDINGS_URL=$(gcloud run services describe $EMBEDDINGS_SERVICE --region=$REGION --format="value(status.url)")
    echo -e "${GREEN}Embeddings URL: $EMBEDDINGS_URL${NC}"

    # Step 7: Deploy API Service with secrets
    print_step "7" "Deploying API Service"
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
      --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,QDRANT_URL=$QDRANT_URL,QDRANT_COLLECTION=docs_v1,CORS_ORIGIN=https://rag-$TENANT-827ad2.web.app,TENANT=$TENANT,VECTOR_DIM=384,PII_POLICY=strict,EMBEDDINGS_PROVIDER=huggingface,EMBEDDINGS_MODEL=BAAI/bge-small-en-v1.5,EMBEDDINGS_URL=$EMBEDDINGS_URL,LLM_ENABLED=true,LLM_PROVIDER=openai,LLM_MODEL=gpt-4-1106-preview,LLM_STREAMING=true,LLM_TIMEOUT_MS=25000,ANSWERABILITY_THRESHOLD=0.01,VECTOR_SEARCH_TIMEOUT_MS=8000,KEYWORD_SEARCH_TIMEOUT_MS=5000,RERANKER_TIMEOUT_MS=15000,OVERALL_TIMEOUT_MS=60000,EMBEDDING_TIMEOUT_MS=8000,RATE_LIMIT_PER_IP=100,RATE_LIMIT_PER_USER=1000,RATE_LIMIT_PER_TENANT=10000,RATE_LIMIT_WINDOW_MINUTES=1" \
      --set-secrets="OPENAI_API_KEY=zenithfall-openai-api-key:latest,INGEST_TOKEN=zenithfall-ingest-token:latest"
    check_success "API deployment"

    API_URL=$(gcloud run services describe $API_SERVICE --region=$REGION --format="value(status.url)")
    echo -e "${GREEN}API URL: $API_URL${NC}"

    # Step 8: Deploy Web Service
    print_step "8" "Deploying Web Service"
    gcloud run deploy $WEB_SERVICE \
      --image=$REGISTRY/$PROJECT_ID/rag-containers/rag-web:latest \
      --region=$REGION \
      --platform=managed \
      --allow-unauthenticated \
      --port=3000 \
      --memory=2Gi \
      --cpu=1 \
      --max-instances=10 \
      --set-env-vars="API_URL=$API_URL,NEXT_PUBLIC_API_URL=$API_URL,API_BASE_URL=$API_URL,TENANT=$TENANT,HOSTNAME=0.0.0.0,NEXT_TELEMETRY_DISABLED=1,NEXT_PUBLIC_TENANT_BRAND_NAME=Zenithfall RAG,NEXT_PUBLIC_TENANT_LOGO_URL=/logos/zenithfall-logo.png,NEXT_PUBLIC_TENANT_PRIMARY_COLOR=#059669,NEXT_PUBLIC_TENANT_SECONDARY_COLOR=#10b981,NEXT_PUBLIC_TENANT_THEME=production"
    check_success "Web deployment"

    WEB_URL=$(gcloud run services describe $WEB_SERVICE --region=$REGION --format="value(status.url)")
    echo -e "${GREEN}Web URL: $WEB_URL${NC}"

    # Export for use in other functions
    export PROJECT_ID API_URL WEB_URL QDRANT_URL EMBEDDINGS_URL
}

# Function to update secrets
update_secrets() {
    print_status "Updating secrets..."

    # Check if OpenAI API key is available
    if [ -n "$OPENAI_API_KEY" ]; then
        print_status "Updating OpenAI API key..."
        echo "$OPENAI_API_KEY" | gcloud secrets versions add zenithfall-openai-api-key \
            --data-file=- \
            --project="$PROJECT_ID"
        print_success "OpenAI API key updated"
    else
        print_warning "OPENAI_API_KEY environment variable not set"
        print_warning "You can update it later with:"
        print_warning "echo 'your-api-key' | gcloud secrets versions add zenithfall-openai-api-key --data-file=- --project='$PROJECT_ID'"
    fi
}

# Function to run post-deployment validation
validate_deployment() {
    print_step "9" "Running Health Checks"
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

    print_success "Deployment validation completed"
}

# Main deployment function
main() {
    echo "🚀 Deploying Zenithfall to Cloud Run (No Firebase Hosting)"
    echo "======================================================="

    check_prerequisites
    validate_project_access
    deploy_infrastructure
    deploy_services
    update_secrets
    validate_deployment

    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
    echo -e "${GREEN}Your Zenithfall RAG Stack is now running on Google Cloud Run:${NC}"
    echo ""
    echo -e "${BLUE}📊 Service URLs:${NC}"
    echo -e "  🔍 Qdrant:     $QDRANT_URL"
    echo -e "  🧠 Embeddings: $EMBEDDINGS_URL"
    echo -e "  🔌 API:        $API_URL"
    echo -e "  🌐 Web App:    $WEB_URL"
    echo ""
    echo -e "${YELLOW}🌟 Visit your application: $WEB_URL${NC}"
    echo -e "${YELLOW}📚 API Documentation: $API_URL/healthz${NC}"
    echo -e "${YELLOW}🔍 Qdrant Console: $QDRANT_URL/dashboard${NC}"
    echo ""
    echo -e "${YELLOW}🔑 Secrets are managed via GCP Secret Manager${NC}"
    echo ""

    # Save URLs to file for reference
    cat > deployment-urls.txt << EOF
# Zenithfall RAG Stack - Cloud Run Deployment
# Generated: $(date)

PROJECT_ID=$PROJECT_ID
REGION=$REGION
TENANT=$TENANT

# Service URLs
QDRANT_URL=$QDRANT_URL
EMBEDDINGS_URL=$EMBEDDINGS_URL
API_URL=$API_URL
WEB_URL=$WEB_URL

# Quick Commands
# View logs: gcloud logging read "resource.type=cloud_run_revision" --project=$PROJECT_ID
# List services: gcloud run services list --region=$REGION
# Update service: gcloud run services update SERVICE_NAME --region=$REGION
# Update secrets: gcloud secrets versions add zenithfall-secret-name --data-file=- --project=$PROJECT_ID
EOF

    echo -e "${GREEN}📝 Service URLs saved to deployment-urls.txt${NC}"
}

# Run main function
main "$@"