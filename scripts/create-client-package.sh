#!/bin/bash

# Create self-hosting deployment package for clients
# Usage: ./scripts/create-client-package.sh <client-name> [--tier <tier>] [--single-tenant]

set -e

CLIENT_NAME="$1"
TIER="${2:-basic}"
SINGLE_TENANT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --tier)
            TIER="$2"
            shift 2
            ;;
        --single-tenant)
            SINGLE_TENANT=true
            shift
            ;;
        *)
            if [[ -z "$CLIENT_NAME" ]]; then
                CLIENT_NAME="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$CLIENT_NAME" ]]; then
    echo "Usage: $0 <client-name> [--tier <tier>] [--single-tenant]"
    echo ""
    echo "Options:"
    echo "  --tier <basic|premium|enterprise>  Deployment tier (default: basic)"
    echo "  --single-tenant                     Create single-tenant simplified package"
    echo ""
    echo "Examples:"
    echo "  $0 acme-corp --tier enterprise --single-tenant"
    echo "  $0 startup-inc --tier basic"
    exit 1
fi

PACKAGE_DIR="client-packages/${CLIENT_NAME}-deployment"
DATE=$(date +%Y%m%d-%H%M%S)

echo "Creating deployment package for: $CLIENT_NAME"
echo "Tier: $TIER"
echo "Single tenant: $SINGLE_TENANT"
echo "Package directory: $PACKAGE_DIR"

# Create package directory
mkdir -p "$PACKAGE_DIR"/{scripts,config,docs}

# Copy base Docker Compose
cp docker-compose.yml "$PACKAGE_DIR/docker-compose.yml"

if [[ "$SINGLE_TENANT" == "true" ]]; then
    echo "Creating single-tenant simplified package..."

    # Simplify docker-compose.yml for single tenant
    sed -i "s/\${PROJECT_PREFIX:-cw-rag}/$CLIENT_NAME-rag/g" "$PACKAGE_DIR/docker-compose.yml"
    sed -i "s/\${TENANT:-zenithfall}/$CLIENT_NAME/g" "$PACKAGE_DIR/docker-compose.yml"
    sed -i "s/\${API_PORT:-3000}/3000/g" "$PACKAGE_DIR/docker-compose.yml"
    sed -i "s/\${WEB_PORT:-3001}/3001/g" "$PACKAGE_DIR/docker-compose.yml"
    sed -i "s/\${QDRANT_PORT:-6333}/6333/g" "$PACKAGE_DIR/docker-compose.yml"

    # Create simplified .env file
    cat > "$PACKAGE_DIR/.env" << EOF
# ${CLIENT_NAME} Self-Hosted RAG System Configuration
# Generated on: $(date)

# Tenant Configuration
TENANT=$CLIENT_NAME
PROJECT_PREFIX=$CLIENT_NAME-rag
INSTANCE_NAME=production

# Standard Ports (no conflicts in dedicated environment)
API_PORT=3000
WEB_PORT=3001
QDRANT_PORT=6333
QDRANT_GRPC_PORT=6334

# Vector Configuration
VECTOR_DIM=384
QDRANT_COLLECTION=docs_v1

# API Configuration
CORS_ORIGIN=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3000

# Security - CHANGE THESE IN PRODUCTION
INGEST_TOKEN=${CLIENT_NAME}-secure-token-$(date +%Y)
# OPENAI_API_KEY=your-openai-api-key-here

# LLM Configuration
LLM_ENABLED=true
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-2025-04-14
LLM_STREAMING=false

# PII Policy
PII_POLICY=OFF

# Embeddings Configuration
EMBEDDINGS_PROVIDER=local
EMBEDDINGS_MODEL=bge-small-en-v1.5

# Performance Tuning for $TIER tier
EOF

    # Add tier-specific configuration
    case $TIER in
        basic)
            cat >> "$PACKAGE_DIR/.env" << EOF
RATE_LIMIT_PER_IP=30
RATE_LIMIT_PER_USER=100
RATE_LIMIT_PER_TENANT=1000
EOF
            ;;
        premium)
            cat >> "$PACKAGE_DIR/.env" << EOF
RATE_LIMIT_PER_IP=100
RATE_LIMIT_PER_USER=300
RATE_LIMIT_PER_TENANT=5000
EOF
            ;;
        enterprise)
            cat >> "$PACKAGE_DIR/.env" << EOF
RATE_LIMIT_PER_IP=500
RATE_LIMIT_PER_USER=1000
RATE_LIMIT_PER_TENANT=50000
EOF
            ;;
    esac

    # Create simplified deployment scripts
    cat > "$PACKAGE_DIR/scripts/deploy.sh" << 'EOF'
#!/bin/bash
# Simple deployment script for self-hosted client

set -e

echo "Starting ${CLIENT_NAME} RAG System..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build and start services
docker-compose up -d --build

echo "Waiting for services to be ready..."
sleep 30

# Health check
echo "Checking service health..."
curl -f http://localhost:3000/readyz || echo "Warning: API health check failed"
curl -f http://localhost:3001 || echo "Warning: Web health check failed"

echo ""
echo "✅ ${CLIENT_NAME} RAG System deployed successfully!"
echo ""
echo "🌐 Web Interface: http://localhost:3001"
echo "🔧 API Endpoint: http://localhost:3000"
echo "📊 Qdrant UI: http://localhost:6333/dashboard"
echo ""
echo "Next steps:"
echo "1. Configure your OpenAI API key in .env file"
echo "2. Upload documents using the web interface"
echo "3. Start querying your documents!"
echo "4. Check for updates regularly: ./scripts/update.sh --check"
EOF

    cat > "$PACKAGE_DIR/scripts/stop.sh" << 'EOF'
#!/bin/bash
echo "Stopping ${CLIENT_NAME} RAG System..."
docker-compose down
echo "✅ System stopped"
EOF

    cat > "$PACKAGE_DIR/scripts/backup.sh" << 'EOF'
#!/bin/bash
# Backup script for self-hosted deployment

BACKUP_DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Creating backup in $BACKUP_DIR..."

# Backup configuration
cp .env "$BACKUP_DIR/"
cp docker-compose.yml "$BACKUP_DIR/"

# Backup Qdrant data
docker-compose exec -T qdrant sh -c "cd /qdrant/data && tar czf - ." > "$BACKUP_DIR/qdrant-data.tar.gz"

# Create backup info
cat > "$BACKUP_DIR/backup-info.json" << BACKUP_EOF
{
  "client": "${CLIENT_NAME}",
  "backup_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_type": "full_system",
  "services": ["api", "web", "qdrant", "embeddings"]
}
BACKUP_EOF

echo "✅ Backup completed: $BACKUP_DIR"
echo "💾 Qdrant data: $BACKUP_DIR/qdrant-data.tar.gz"
echo "⚙️  Configuration: $BACKUP_DIR/.env"
EOF

    # Copy update template
    cp scripts/client-update-template.sh "$PACKAGE_DIR/scripts/update.sh"

    chmod +x "$PACKAGE_DIR/scripts/"*.sh

else
    echo "Creating full multi-tenant package..."

    # Copy full configuration and scripts for multi-tenant self-hosting
    cp .env.example "$PACKAGE_DIR/.env.example"
    cp -r scripts/create-tenant.sh "$PACKAGE_DIR/scripts/"
    cp -r scripts/manage-tenants.sh "$PACKAGE_DIR/scripts/"

    # Create tenant registry
    mkdir -p "$PACKAGE_DIR/tenants"
    cat > "$PACKAGE_DIR/tenants/registry.json" << EOF
{
  "client": "$CLIENT_NAME",
  "deployment_type": "self_hosted_multi_tenant",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tenants": []
}
EOF
fi

# Create documentation
cat > "$PACKAGE_DIR/README.md" << EOF
# ${CLIENT_NAME} Self-Hosted RAG System

## Quick Start

1. **Configure Environment**
   \`\`\`bash
   # Edit .env file with your settings
   nano .env
   # Add your OpenAI API key and other configuration
   \`\`\`

2. **Deploy System**
   \`\`\`bash
   ./scripts/deploy.sh
   \`\`\`

3. **Access Services**
   - Web Interface: http://localhost:3001
   - API: http://localhost:3000
   - Qdrant Dashboard: http://localhost:6333/dashboard

## Management Commands

\`\`\`bash
# Start system
./scripts/deploy.sh

# Stop system
./scripts/stop.sh

# Create backup
./scripts/backup.sh

# View logs
docker-compose logs -f

# Check for updates
./scripts/update.sh --check

# Apply Docker image updates
./scripts/update.sh --apply-docker

# Apply update package
./scripts/update.sh --apply-local update-package.tar.gz
\`\`\`

## Updates

\`\`\`bash
# Check for available updates
./scripts/update.sh --check

# Apply Docker image updates (most common)
./scripts/update.sh --apply-docker

# Apply update package from file
./scripts/update.sh --apply-local update-v1.2.0.tar.gz

# View update status
./scripts/update.sh --status
\`\`\`

## Support

- Configuration: Edit \`.env\` file
- Logs: \`docker-compose logs\`
- Updates: Pull latest Docker images
- Backup: Use \`./scripts/backup.sh\`

## Security Notes

⚠️ **Important**: Change default tokens and passwords in production!

1. Update \`INGEST_TOKEN\` in \`.env\`
2. Set strong \`OPENAI_API_KEY\`
3. Consider firewall rules for production deployment

EOF

# Create package info
cat > "$PACKAGE_DIR/package-info.json" << EOF
{
  "client": "$CLIENT_NAME",
  "tier": "$TIER",
  "single_tenant": $SINGLE_TENANT,
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "1.0.0",
  "deployment_type": "$([ "$SINGLE_TENANT" == "true" ] && echo "single_tenant_self_hosted" || echo "multi_tenant_self_hosted")"
}
EOF

echo ""
echo "✅ Client package created successfully!"
echo ""
echo "📦 Package location: $PACKAGE_DIR"
echo "📋 Deployment type: $([ "$SINGLE_TENANT" == "true" ] && echo "Single-tenant self-hosted" || echo "Multi-tenant self-hosted")"
echo "🎯 Tier: $TIER"
echo ""
echo "Next steps:"
echo "1. Review and customize .env configuration"
echo "2. Package and send to client: tar -czf ${CLIENT_NAME}-deployment.tar.gz ${PACKAGE_DIR}"
echo "3. Client extracts and runs: ./scripts/deploy.sh"
echo ""
echo "Client will have:"
if [[ "$SINGLE_TENANT" == "true" ]]; then
    echo "  • Simple single-tenant deployment"
    echo "  • Standard ports (3000, 3001, 6333)"
    echo "  • Automated deployment scripts"
else
    echo "  • Full multi-tenant capability"
    echo "  • Tenant management scripts"
    echo "  • Scalable configuration"
fi
echo "  • Complete documentation"
echo "  • Backup and maintenance tools"
echo "  • Automatic update system"