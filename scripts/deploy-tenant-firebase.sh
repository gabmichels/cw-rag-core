#!/bin/bash
# Safe tenant-isolated Firebase deployment script
# This prevents accidental cross-tenant deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to validate tenant
validate_tenant() {
    local tenant_id="$1"

    if [ -z "$tenant_id" ]; then
        print_error "Tenant ID is required"
        echo "Usage: $0 <tenant-id>"
        echo "Example: $0 zenithfall"
        exit 1
    fi

    # Check if tenant deployment directory exists
    if [ ! -d "deployments/tenants/$tenant_id" ]; then
        print_error "Tenant deployment directory not found: deployments/tenants/$tenant_id"
        print_error "Please run Terraform to create the infrastructure first"
        exit 1
    fi

    # Check if deployment info exists
    if [ ! -f "${tenant_id}-deployment.json" ]; then
        print_error "Deployment info not found: ${tenant_id}-deployment.json"
        print_error "Please run Terraform to create the infrastructure first"
        exit 1
    fi

    print_success "Tenant validated: $tenant_id"
}

# Function to load tenant configuration safely
load_tenant_config() {
    local tenant_id="$1"

    print_status "Loading tenant configuration for $tenant_id..."

    # Load deployment info
    if [ -f "${tenant_id}-deployment.json" ]; then
        PROJECT_ID=$(jq -r '.project_id' "${tenant_id}-deployment.json")
        API_URL=$(jq -r '.urls.api' "${tenant_id}-deployment.json")
        WEB_URL=$(jq -r '.urls.web' "${tenant_id}-deployment.json")
        REGION=$(jq -r '.region' "${tenant_id}-deployment.json")

        print_success "Loaded deployment configuration:"
        print_success "  Project ID: $PROJECT_ID"
        print_success "  API URL: $API_URL"
        print_success "  Web URL: $WEB_URL"
        print_success "  Region: $REGION"
    else
        print_error "Deployment configuration not found"
        exit 1
    fi

    # Load environment configuration
    if [ -f ".env.${tenant_id}.firebase" ]; then
        set -a
        source ".env.${tenant_id}.firebase"
        set +a
        print_success "Loaded Firebase environment configuration"
    else
        print_warning "Firebase environment file not found, using defaults"
    fi
}

# Function to switch to tenant Firebase project safely
switch_firebase_project() {
    local project_id="$1"

    print_status "Switching to Firebase project: $project_id"

    # Check if we have access to the project
    if ! firebase projects:list | grep -q "$project_id"; then
        print_error "No access to Firebase project: $project_id"
        print_error "Please ensure you have access to this project"
        exit 1
    fi

    # Switch to the project
    firebase use "$project_id"

    # Double-check we're using the right project
    CURRENT_PROJECT=$(firebase use)
    if [ "$CURRENT_PROJECT" != "$project_id" ]; then
        print_error "Failed to switch to project $project_id"
        print_error "Currently using: $CURRENT_PROJECT"
        exit 1
    fi

    print_success "Successfully switched to project: $project_id"
}

# Function to build web app with tenant-specific config
build_web_app() {
    local tenant_id="$1"

    print_status "Building web application for $tenant_id..."

    cd apps/web

    # Install dependencies
    pnpm install

    # Build with Firebase-specific configuration
    FIREBASE_DEPLOYMENT=true \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="$PROJECT_ID" \
    NEXT_PUBLIC_API_URL="$API_URL" \
    NEXT_PUBLIC_TENANT_ID="$tenant_id" \
    pnpm build

    print_success "Web application built successfully"

    cd - > /dev/null
}

# Function to deploy from tenant directory
deploy_to_firebase() {
    local tenant_id="$1"
    local deployment_dir="deployments/tenants/$tenant_id"

    print_status "Deploying $tenant_id to Firebase Hosting..."

    # Switch to tenant deployment directory
    cd "$deployment_dir"

    # Deploy using tenant-specific configuration
    firebase deploy --only hosting,firestore:rules,firestore:indexes --project="$PROJECT_ID"

    print_success "Deployment completed successfully"

    cd - > /dev/null
}

# Function to validate deployment
validate_deployment() {
    local web_url="$1"
    local api_url="$2"

    print_status "Validating deployment..."

    # Test web app
    if curl -f "$web_url" >/dev/null 2>&1; then
        print_success "Web app is accessible: $web_url"
    else
        print_warning "Web app not accessible yet (this is normal for new deployments)"
    fi

    # Test API
    if curl -f "${api_url}/healthz" >/dev/null 2>&1; then
        print_success "API is healthy: ${api_url}/healthz"
    else
        print_warning "API not responding yet (this is normal for new deployments)"
    fi
}

# Main function
main() {
    local tenant_id="$1"

    echo "🚀 Safe Tenant Firebase Deployment"
    echo "====================================="
    echo "🎯 Target Tenant: $tenant_id"
    echo ""

    validate_tenant "$tenant_id"
    load_tenant_config "$tenant_id"
    switch_firebase_project "$PROJECT_ID"
    build_web_app "$tenant_id"
    deploy_to_firebase "$tenant_id"
    validate_deployment "$WEB_URL" "$API_URL"

    echo ""
    print_success "🎉 $tenant_id deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "   Tenant: $tenant_id"
    echo "   Project: $PROJECT_ID"
    echo "   Web URL: $WEB_URL"
    echo "   API URL: $API_URL"
    echo "   Console: https://console.firebase.google.com/project/$PROJECT_ID"
    echo ""
    echo "🔐 Security Features:"
    echo "   ✅ Tenant-isolated deployment directory"
    echo "   ✅ Automatic project switching with validation"
    echo "   ✅ Tenant-specific configuration loading"
    echo "   ✅ Cross-contamination prevention"
    echo ""
}

# Safety check: Ensure we're in the project root
if [ ! -f "package.json" ] || [ ! -d "deployments" ]; then
    print_error "This script must be run from the project root directory"
    exit 1
fi

# Run main function
main "$@"