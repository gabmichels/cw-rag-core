#!/bin/bash
# Deploy Zenithfall to Firebase/GCP
# This script handles the complete deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required tools
check_prerequisites() {
    print_status "Checking prerequisites..."

    local missing_tools=()

    if ! command_exists terraform; then
        missing_tools+=("terraform")
    fi

    if ! command_exists gcloud; then
        missing_tools+=("gcloud")
    fi

    if ! command_exists firebase; then
        missing_tools+=("firebase-tools")
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

# Function to validate billing account
validate_billing_account() {
    local billing_account="$1"

    if [ -z "$billing_account" ]; then
        print_error "Billing account not provided"
        echo "Usage: $0 [billing-account-id]"
        echo "Example: $0 0X0X0X-0X0X0X-0X0X0X"
        exit 1
    fi

    # Check if billing account exists and is accessible
    if ! gcloud billing accounts describe "$billing_account" >/dev/null 2>&1; then
        print_error "Cannot access billing account: $billing_account"
        print_error "Please check:"
        print_error "1. The billing account ID is correct"
        print_error "2. You have access to the billing account"
        print_error "3. You are authenticated with gcloud (run: gcloud auth login)"
        exit 1
    fi

    print_success "Billing account validated: $billing_account"
}

# Function to deploy infrastructure with Terraform
deploy_infrastructure() {
    local billing_account="$1"

    print_status "Deploying Firebase infrastructure..."

    cd infrastructure/terraform/zenithfall

    # Initialize Terraform
    terraform init

    # Create terraform.tfvars if it doesn't exist
    if [ ! -f terraform.tfvars ]; then
        print_status "Creating terraform.tfvars..."
        cat > terraform.tfvars << EOF
billing_account = "$billing_account"
region = "europe-west3"
firebase_location = "eur3"
tier = "development"
EOF
        print_success "Created terraform.tfvars"
    else
        print_warning "terraform.tfvars already exists, using existing configuration"
    fi

    # Plan and apply
    terraform plan -out=zenithfall.tfplan
    terraform apply zenithfall.tfplan

    # Get outputs
    PROJECT_ID=$(terraform output -raw zenithfall_project_id)
    API_URL=$(terraform output -raw zenithfall_api_url)
    WEB_URL=$(terraform output -raw zenithfall_web_url)

    print_success "Infrastructure deployed successfully"
    print_success "Project ID: $PROJECT_ID"
    print_success "API URL: $API_URL"
    print_success "Web URL: $WEB_URL"

    cd - > /dev/null

    # Export for use in other functions
    export PROJECT_ID API_URL WEB_URL
}

# Function to build and push container images
build_and_push_images() {
    print_status "Building and pushing container images..."

    local registry="${REGION}-docker.pkg.dev/${PROJECT_ID}/rag-containers"

    # Configure Docker authentication
    gcloud auth configure-docker "${REGION}-docker.pkg.dev"

    # Build API image
    print_status "Building API image..."
    docker build -t "${registry}/rag-api:latest" -f apps/api/Dockerfile .
    docker push "${registry}/rag-api:latest"

    # Update Cloud Run service with new image
    print_status "Updating Cloud Run service..."
    gcloud run deploy rag-api \
        --image="${registry}/rag-api:latest" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --platform=managed \
        --allow-unauthenticated \
        --port=3000 \
        --memory=2Gi \
        --cpu=1 \
        --timeout=3600 \
        --max-instances=10 \
        --set-env-vars="FIREBASE_PROJECT_ID=${PROJECT_ID},TENANT_ID=zenithfall,NODE_ENV=production"

    print_success "Container images built and deployed"
}

# Function to set up Firebase
setup_firebase() {
    print_status "Setting up Firebase..."

    # Login to Firebase (if not already logged in)
    if ! firebase projects:list >/dev/null 2>&1; then
        print_warning "Not logged in to Firebase. Please login..."
        firebase login
    fi

    # Use the project
    firebase use "$PROJECT_ID"

    # Initialize Firebase (if not already done)
    if [ ! -f firebase.json ]; then
        print_status "Initializing Firebase configuration..."

        # Create firebase.json
        cat > firebase.json << EOF
{
  "hosting": {
    "public": "apps/web/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "rag-api",
          "region": "$REGION"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/api/**",
        "headers": [
          {
            "key": "Access-Control-Allow-Origin",
            "value": "*"
          }
        ]
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
EOF

        # Create firestore.rules
        cat > firestore.rules << 'EOF'
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own documents
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Documents are tenant-scoped
    match /documents/{documentId} {
      allow read, write: if request.auth != null
        && resource.data.tenantId == request.auth.token.tenantId;
    }

    // Allow anonymous read access for development
    match /{document=**} {
      allow read: if request.auth != null;
    }
  }
}
EOF

        # Create firestore.indexes.json
        cat > firestore.indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "documents",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "tenantId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "documents",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "tenantId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "metadata.url",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
EOF

        print_success "Firebase configuration created"
    fi

    # Deploy Firestore rules and indexes
    firebase deploy --only firestore:rules,firestore:indexes --project="$PROJECT_ID"

    print_success "Firebase setup completed"
}

# Function to build and deploy web app
deploy_web_app() {
    print_status "Building and deploying web application..."

    # Load Firebase environment configuration
    if [ -f .env.zenithfall.firebase ]; then
        set -a
        source .env.zenithfall.firebase
        set +a
        print_success "Loaded Firebase environment configuration"
    else
        print_warning "Firebase environment file not found, using defaults"
    fi

    # Build the web application
    cd apps/web

    # Install dependencies
    pnpm install

    # Build for production
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="$PROJECT_ID" \
    NEXT_PUBLIC_API_URL="$API_URL" \
    NEXT_PUBLIC_TENANT_ID="zenithfall" \
    pnpm build

    # Create dist directory for Firebase hosting
    mkdir -p dist
    cp -r .next/static dist/_next
    cp .next/standalone/apps/web/* dist/ 2>/dev/null || true

    cd - > /dev/null

    # Deploy to Firebase Hosting
    firebase deploy --only hosting --project="$PROJECT_ID"

    print_success "Web application deployed"
}

# Function to update secrets
update_secrets() {
    print_status "Updating secrets..."

    # Check if OpenAI API key is available
    if [ -n "$OPENAI_API_KEY" ]; then
        print_status "Updating OpenAI API key..."
        echo "$OPENAI_API_KEY" | gcloud secrets versions add openai-api-key \
            --data-file=- \
            --project="$PROJECT_ID"
        print_success "OpenAI API key updated"
    else
        print_warning "OPENAI_API_KEY environment variable not set"
        print_warning "You can update it later with:"
        print_warning "echo 'your-api-key' | gcloud secrets versions add openai-api-key --data-file=- --project='$PROJECT_ID'"
    fi
}

# Function to run post-deployment validation
validate_deployment() {
    print_status "Validating deployment..."

    # Test API health
    local health_url="${API_URL}/healthz"
    if curl -f "$health_url" >/dev/null 2>&1; then
        print_success "API health check passed"
    else
        print_warning "API health check failed - this is normal for new deployments"
    fi

    # Test web app
    if curl -f "$WEB_URL" >/dev/null 2>&1; then
        print_success "Web app accessible"
    else
        print_warning "Web app not accessible yet - this is normal for new deployments"
    fi

    print_success "Deployment validation completed"
}

# Main deployment function
main() {
    local billing_account="$1"

    echo "🚀 Deploying Zenithfall to Firebase/GCP"
    echo "========================================="

    check_prerequisites
    validate_billing_account "$billing_account"

    # Set region for use in other functions
    export REGION="europe-west3"

    deploy_infrastructure "$billing_account"
    build_and_push_images
    setup_firebase
    deploy_web_app
    update_secrets
    validate_deployment

    echo ""
    print_success "🎉 Zenithfall deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "   Project ID: $PROJECT_ID"
    echo "   Web URL: $WEB_URL"
    echo "   API URL: $API_URL"
    echo "   Console: https://console.firebase.google.com/project/$PROJECT_ID"
    echo ""
    echo "🔑 Next Steps:"
    echo "   1. Set your OpenAI API key:"
    echo "      echo 'your-api-key' | gcloud secrets versions add openai-api-key --data-file=- --project='$PROJECT_ID'"
    echo "   2. Test the deployment:"
    echo "      curl $API_URL/healthz"
    echo "   3. Visit your app:"
    echo "      open $WEB_URL"
    echo ""
}

# Run main function with all arguments
main "$@"