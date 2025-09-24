#!/bin/bash

# Create update package for self-hosted clients
# Usage: ./scripts/create-update-package.sh <version> [--breaking] [--security]

set -e

VERSION="$1"
BREAKING_CHANGE=false
SECURITY_UPDATE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --breaking)
            BREAKING_CHANGE=true
            shift
            ;;
        --security)
            SECURITY_UPDATE=true
            shift
            ;;
        *)
            if [[ -z "$VERSION" ]]; then
                VERSION="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 <version> [--breaking] [--security]"
    echo ""
    echo "Options:"
    echo "  --breaking    Include breaking changes requiring manual intervention"
    echo "  --security    Mark as security update (high priority)"
    echo ""
    echo "Examples:"
    echo "  $0 v1.2.3                    # Minor update"
    echo "  $0 v2.0.0 --breaking         # Major update with breaking changes"
    echo "  $0 v1.2.4 --security         # Security patch"
    exit 1
fi

UPDATE_DIR="client-updates/${VERSION}"
DATE=$(date +%Y%m%d-%H%M%S)

echo "Creating update package: $VERSION"
echo "Breaking change: $BREAKING_CHANGE"
echo "Security update: $SECURITY_UPDATE"

mkdir -p "$UPDATE_DIR"/{scripts,config,docs}

# Create update metadata
cat > "$UPDATE_DIR/update-info.json" << EOF
{
  "version": "$VERSION",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "breaking_change": $BREAKING_CHANGE,
  "security_update": $SECURITY_UPDATE,
  "priority": "$([ "$SECURITY_UPDATE" == "true" ] && echo "critical" || ([ "$BREAKING_CHANGE" == "true" ] && echo "high" || echo "normal"))",
  "update_type": "$([ "$BREAKING_CHANGE" == "true" ] && echo "major" || echo "minor")"
}
EOF

# Create automated update script
cat > "$UPDATE_DIR/scripts/update.sh" << 'EOF'
#!/bin/bash
# Automated update script for self-hosted clients

set -e

BACKUP_DIR="backups/pre-update-$(date +%Y%m%d-%H%M%S)"
UPDATE_INFO="update-info.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if update info exists
if [[ ! -f "$UPDATE_INFO" ]]; then
    error "Update info not found. Run this script from the update package directory."
fi

# Read update metadata
VERSION=$(jq -r '.version' "$UPDATE_INFO")
BREAKING_CHANGE=$(jq -r '.breaking_change' "$UPDATE_INFO")
SECURITY_UPDATE=$(jq -r '.security_update' "$UPDATE_INFO")
PRIORITY=$(jq -r '.priority' "$UPDATE_INFO")

log "Starting update to $VERSION"
log "Priority: $PRIORITY"

if [[ "$SECURITY_UPDATE" == "true" ]]; then
    warning "🔒 This is a SECURITY UPDATE - recommended to apply immediately"
fi

if [[ "$BREAKING_CHANGE" == "true" ]]; then
    warning "⚠️  This update contains BREAKING CHANGES"
    echo "Please review the changelog before proceeding."
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Update cancelled by user"
        exit 0
    fi
fi

# Create backup
log "Creating backup..."
mkdir -p "$BACKUP_DIR"

# Backup configuration
cp .env "$BACKUP_DIR/" 2>/dev/null || true
cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true

# Backup data if services are running
if docker-compose ps | grep -q "Up"; then
    log "Backing up Qdrant data..."
    docker-compose exec -T qdrant sh -c "cd /qdrant/data && tar czf - ." > "$BACKUP_DIR/qdrant-data.tar.gz" || warning "Qdrant backup failed"
fi

success "Backup created: $BACKUP_DIR"

# Apply updates
log "Applying updates..."

# Update Docker images
log "Pulling latest Docker images..."
docker-compose pull || error "Failed to pull Docker images"

# Apply configuration changes if provided
if [[ -f "config/docker-compose.yml" ]]; then
    log "Updating docker-compose.yml..."
    cp "config/docker-compose.yml" "../docker-compose.yml"
fi

if [[ -f "config/.env.patch" ]]; then
    log "Applying environment configuration patches..."
    # Apply environment patches carefully
    source "config/.env.patch"
fi

# Restart services
log "Restarting services..."
cd ..
docker-compose down
docker-compose up -d

# Health check
log "Waiting for services to be ready..."
sleep 30

# Verify deployment
log "Verifying deployment..."
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/readyz || echo "000")
WEB_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 || echo "000")

if [[ "$API_HEALTH" == "200" ]] && [[ "$WEB_HEALTH" == "200" ]]; then
    success "✅ Update completed successfully!"
    success "System is healthy and running $VERSION"
else
    error "❌ Health check failed. API: $API_HEALTH, Web: $WEB_HEALTH"
    warning "Rolling back to backup..."

    # Rollback
    docker-compose down
    cp "$BACKUP_DIR/.env" .env 2>/dev/null || true
    cp "$BACKUP_DIR/docker-compose.yml" docker-compose.yml 2>/dev/null || true
    docker-compose up -d

    error "Update failed and was rolled back. Check logs: docker-compose logs"
fi

# Cleanup old backups (keep last 5)
log "Cleaning up old backups..."
cd backups
ls -t | tail -n +6 | xargs rm -rf 2>/dev/null || true
cd ..

success "Update to $VERSION completed successfully!"

# Show post-update information
if [[ -f "docs/post-update-notes.md" ]]; then
    echo ""
    echo "📋 Post-Update Notes:"
    cat "docs/post-update-notes.md"
fi
EOF

# Create rollback script
cat > "$UPDATE_DIR/scripts/rollback.sh" << 'EOF'
#!/bin/bash
# Rollback script for self-hosted clients

set -e

BACKUP_DIR="$1"

if [[ -z "$BACKUP_DIR" ]]; then
    echo "Usage: $0 <backup-directory>"
    echo ""
    echo "Available backups:"
    ls -la backups/
    exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "Error: Backup directory not found: $BACKUP_DIR"
    exit 1
fi

echo "Rolling back to backup: $BACKUP_DIR"

# Stop current services
docker-compose down

# Restore configuration
cp "$BACKUP_DIR/.env" .env 2>/dev/null || echo "No .env backup found"
cp "$BACKUP_DIR/docker-compose.yml" docker-compose.yml 2>/dev/null || echo "No docker-compose.yml backup found"

# Restore data if available
if [[ -f "$BACKUP_DIR/qdrant-data.tar.gz" ]]; then
    echo "Restoring Qdrant data..."
    docker-compose up -d qdrant
    sleep 10
    docker-compose exec -T qdrant sh -c "cd /qdrant/data && rm -rf * && tar xzf -" < "$BACKUP_DIR/qdrant-data.tar.gz"
    docker-compose restart qdrant
fi

# Start services
docker-compose up -d

echo "✅ Rollback completed"
echo "🔍 Verify system health: docker-compose ps"
EOF

chmod +x "$UPDATE_DIR/scripts/"*.sh

# Create version-specific update instructions
cat > "$UPDATE_DIR/docs/update-notes.md" << EOF
# Update to $VERSION

## Overview

$([ "$SECURITY_UPDATE" == "true" ] && echo "🔒 **SECURITY UPDATE** - Apply immediately" || echo "Regular update")
$([ "$BREAKING_CHANGE" == "true" ] && echo "⚠️ **BREAKING CHANGES** - Manual intervention required" || echo "✅ Automatic update available")

## What's New in $VERSION

- Feature updates
- Bug fixes
- Security improvements
- Performance enhancements

## Update Process

### Automatic Update (Recommended)
\`\`\`bash
# Extract update package
tar -xzf update-${VERSION}.tar.gz
cd update-${VERSION}

# Run automated update
./scripts/update.sh
\`\`\`

### Manual Update
\`\`\`bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose down && docker-compose up -d
\`\`\`

## Breaking Changes

$([ "$BREAKING_CHANGE" == "true" ] && cat << 'BREAKING_EOF'
⚠️ **Important Changes in this Version:**

1. **Configuration Changes**
   - New environment variables required
   - Deprecated settings removed

2. **API Changes**
   - Updated endpoint schemas
   - New authentication requirements

3. **Data Migration**
   - Database schema updates
   - Index reconstruction required

**Action Required:**
- Review configuration before updating
- Test in staging environment first
- Plan for service downtime during migration
BREAKING_EOF
)

## Rollback Instructions

If issues occur, rollback using:
\`\`\`bash
# List available backups
ls backups/

# Rollback to specific backup
./scripts/rollback.sh backups/pre-update-YYYYMMDD-HHMMSS
\`\`\`

## Verification

After update, verify:
\`\`\`bash
# Check service health
curl http://localhost:3000/readyz
curl http://localhost:3001

# View service status
docker-compose ps

# Check logs for errors
docker-compose logs
\`\`\`

## Support

If you encounter issues:
1. Check logs: \`docker-compose logs\`
2. Verify configuration: \`cat .env\`
3. Test connectivity: \`curl localhost:3000/readyz\`
4. Rollback if needed: \`./scripts/rollback.sh <backup-dir>\`

EOF

# Copy current configuration files for reference
cp docker-compose.yml "$UPDATE_DIR/config/" 2>/dev/null || true
cp .env.example "$UPDATE_DIR/config/.env.example" 2>/dev/null || true

# Create distribution package
tar -czf "${UPDATE_DIR}.tar.gz" -C "client-updates" "${VERSION}"

echo ""
success "✅ Update package created: ${UPDATE_DIR}.tar.gz"
echo ""
echo "📦 Package contents:"
echo "  • Automated update script"
echo "  • Rollback capability"
echo "  • Configuration updates"
echo "  • Documentation"
echo ""
echo "📋 Distribution:"
echo "  1. Test update in staging environment"
echo "  2. Send package to clients: ${UPDATE_DIR}.tar.gz"
echo "  3. Clients run: ./scripts/update.sh"
echo ""
echo "🔄 Update priority: $PRIORITY"
echo "⚠️  Breaking changes: $BREAKING_CHANGE"
echo "🔒 Security update: $SECURITY_UPDATE"