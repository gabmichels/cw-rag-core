#!/bin/bash
# Client-side update script template
# This gets included in every client package for self-hosted updates

set -e

# Configuration
UPDATE_SERVER_URL="${UPDATE_SERVER_URL:-https://updates.your-domain.com}"
CLIENT_ID="${CLIENT_ID:-}"
CLIENT_VERSION="${CLIENT_VERSION:-1.0.0}"
AUTO_UPDATE="${AUTO_UPDATE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check for updates
check_updates() {
    log "Checking for updates..."

    # Read current version
    if [[ -f "package-info.json" ]]; then
        CURRENT_VERSION=$(jq -r '.version // "1.0.0"' package-info.json)
    else
        CURRENT_VERSION="1.0.0"
    fi

    log "Current version: $CURRENT_VERSION"

    # Check for available updates (multiple methods)
    check_docker_updates
    check_remote_updates
    check_local_updates
}

# Method 1: Docker image updates (most common)
check_docker_updates() {
    log "Checking Docker image updates..."

    # Pull latest images to see if there are updates
    if docker-compose pull --quiet 2>/dev/null; then
        # Check if any images were updated
        UPDATED_IMAGES=$(docker-compose pull 2>&1 | grep -c "Downloaded newer image" || echo "0")

        if [[ "$UPDATED_IMAGES" -gt 0 ]]; then
            success "🔄 $UPDATED_IMAGES Docker image update(s) available"

            if [[ "$AUTO_UPDATE" == "true" ]]; then
                apply_docker_update
            else
                echo ""
                echo "To update, run:"
                echo "  ./update.sh --apply-docker"
                echo ""
            fi
        else
            log "✅ Docker images are up to date"
        fi
    else
        warning "Could not check for Docker updates"
    fi
}

# Method 2: Remote update server (if configured)
check_remote_updates() {
    if [[ -n "$UPDATE_SERVER_URL" ]] && [[ -n "$CLIENT_ID" ]]; then
        log "Checking remote update server..."

        # Query update server
        UPDATE_INFO=$(curl -s "${UPDATE_SERVER_URL}/api/updates/check" \
            -H "X-Client-ID: $CLIENT_ID" \
            -H "X-Current-Version: $CURRENT_VERSION" \
            -H "Content-Type: application/json" \
            2>/dev/null || echo "{}")

        if [[ "$UPDATE_INFO" != "{}" ]]; then
            AVAILABLE_VERSION=$(echo "$UPDATE_INFO" | jq -r '.available_version // ""')
            UPDATE_PRIORITY=$(echo "$UPDATE_INFO" | jq -r '.priority // "normal"')
            SECURITY_UPDATE=$(echo "$UPDATE_INFO" | jq -r '.security_update // false')

            if [[ -n "$AVAILABLE_VERSION" ]] && [[ "$AVAILABLE_VERSION" != "$CURRENT_VERSION" ]]; then
                success "🆕 Remote update available: $AVAILABLE_VERSION"

                if [[ "$SECURITY_UPDATE" == "true" ]]; then
                    warning "🔒 SECURITY UPDATE - Apply immediately!"
                fi

                echo "Priority: $UPDATE_PRIORITY"
                echo "Download: ${UPDATE_SERVER_URL}/downloads/update-${AVAILABLE_VERSION}.tar.gz"
                echo ""
            fi
        fi
    fi
}

# Method 3: Local update packages
check_local_updates() {
    if [[ -d "updates" ]]; then
        log "Checking local update packages..."

        # Find newest update package
        LATEST_UPDATE=$(ls updates/update-*.tar.gz 2>/dev/null | sort -V | tail -1 || echo "")

        if [[ -n "$LATEST_UPDATE" ]]; then
            UPDATE_VERSION=$(basename "$LATEST_UPDATE" | sed 's/update-\(.*\)\.tar\.gz/\1/')
            success "📦 Local update package found: $UPDATE_VERSION"
            echo "To apply: ./update.sh --apply-local $LATEST_UPDATE"
            echo ""
        fi
    fi
}

# Apply Docker image updates
apply_docker_update() {
    log "Applying Docker image updates..."

    # Create backup
    BACKUP_DIR="backups/docker-update-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # Backup configuration
    cp .env "$BACKUP_DIR/" 2>/dev/null || true
    cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true

    # Backup data if services are running
    if docker-compose ps | grep -q "Up"; then
        log "Creating data backup..."
        docker-compose exec -T qdrant sh -c "cd /qdrant/data && tar czf - ." > "$BACKUP_DIR/qdrant-data.tar.gz" 2>/dev/null || true
    fi

    success "Backup created: $BACKUP_DIR"

    # Update services
    log "Updating services..."
    docker-compose down
    docker-compose up -d

    # Health check
    log "Verifying update..."
    sleep 30

    API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/readyz 2>/dev/null || echo "000")
    WEB_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null || echo "000")

    if [[ "$API_HEALTH" == "200" ]] && [[ "$WEB_HEALTH" == "200" ]]; then
        success "✅ Docker update completed successfully!"
    else
        error "❌ Update failed. Health check: API=$API_HEALTH, Web=$WEB_HEALTH"
    fi
}

# Apply local update package
apply_local_update() {
    local UPDATE_PACKAGE="$1"

    if [[ ! -f "$UPDATE_PACKAGE" ]]; then
        error "Update package not found: $UPDATE_PACKAGE"
    fi

    log "Applying local update: $UPDATE_PACKAGE"

    # Extract update package
    UPDATE_DIR="temp-update-$(date +%s)"
    mkdir -p "$UPDATE_DIR"
    tar -xzf "$UPDATE_PACKAGE" -C "$UPDATE_DIR"

    # Find and run update script
    UPDATE_SCRIPT=$(find "$UPDATE_DIR" -name "update.sh" | head -1)

    if [[ -n "$UPDATE_SCRIPT" ]]; then
        cd "$(dirname "$UPDATE_SCRIPT")"
        ./update.sh
        cd - > /dev/null
    else
        error "No update script found in package"
    fi

    # Cleanup
    rm -rf "$UPDATE_DIR"
}

# Download and apply remote update
apply_remote_update() {
    local VERSION="$1"

    if [[ -z "$UPDATE_SERVER_URL" ]] || [[ -z "$VERSION" ]]; then
        error "Update server URL or version not specified"
    fi

    log "Downloading update $VERSION..."

    UPDATE_URL="${UPDATE_SERVER_URL}/downloads/update-${VERSION}.tar.gz"
    UPDATE_FILE="update-${VERSION}.tar.gz"

    # Download update package
    if curl -L -o "$UPDATE_FILE" "$UPDATE_URL"; then
        success "Downloaded: $UPDATE_FILE"
        apply_local_update "$UPDATE_FILE"
        rm -f "$UPDATE_FILE"
    else
        error "Failed to download update from $UPDATE_URL"
    fi
}

# Show update status
show_status() {
    echo "════════════════════════════════════════"
    echo "           Update Status"
    echo "════════════════════════════════════════"

    if [[ -f "package-info.json" ]]; then
        echo "Current Version: $(jq -r '.version // "unknown"' package-info.json)"
        echo "Client ID: $(jq -r '.client // "unknown"' package-info.json)"
        echo "Deployment Type: $(jq -r '.deployment_type // "unknown"' package-info.json)"
    else
        echo "Current Version: unknown"
    fi

    echo "Auto Update: $AUTO_UPDATE"
    echo "Update Server: ${UPDATE_SERVER_URL:-"not configured"}"

    echo ""
    echo "Service Status:"
    docker-compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"

    echo ""
    echo "Available Commands:"
    echo "  ./update.sh --check          Check for updates"
    echo "  ./update.sh --apply-docker   Apply Docker image updates"
    echo "  ./update.sh --apply-local    Apply local update package"
    echo "  ./update.sh --apply-remote   Download and apply remote update"
    echo "  ./update.sh --status         Show this status"
    echo "════════════════════════════════════════"
}

# Main script logic
case "${1:---check}" in
    --check)
        check_updates
        ;;
    --apply-docker)
        apply_docker_update
        ;;
    --apply-local)
        apply_local_update "$2"
        ;;
    --apply-remote)
        apply_remote_update "$2"
        ;;
    --status)
        show_status
        ;;
    --help)
        echo "Self-Hosted Client Update Manager"
        echo ""
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  --check                    Check for available updates (default)"
        echo "  --apply-docker             Apply Docker image updates"
        echo "  --apply-local <file>       Apply local update package"
        echo "  --apply-remote <version>   Download and apply remote update"
        echo "  --status                   Show system status"
        echo "  --help                     Show this help"
        echo ""
        echo "Environment Variables:"
        echo "  UPDATE_SERVER_URL          Remote update server URL"
        echo "  CLIENT_ID                  Client identifier for remote updates"
        echo "  AUTO_UPDATE               Enable automatic updates (true/false)"
        echo ""
        echo "Examples:"
        echo "  $0 --check                           # Check for updates"
        echo "  $0 --apply-docker                    # Update Docker images"
        echo "  $0 --apply-local update-v1.2.0.tar.gz   # Apply local package"
        echo "  $0 --apply-remote v1.2.0             # Download and apply v1.2.0"
        ;;
    *)
        error "Unknown command: $1. Use --help for usage information."
        ;;
esac