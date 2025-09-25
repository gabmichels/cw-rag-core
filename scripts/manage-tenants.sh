#!/bin/bash

# Tenant Management Script
# Usage: ./scripts/manage-tenants.sh <command> [options]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

show_usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
  list                  List all tenants
  status [tenant-id]    Show status of all tenants or specific tenant
  start <tenant-id>     Start tenant services
  stop <tenant-id>      Stop tenant services
  restart <tenant-id>   Restart tenant services
  logs <tenant-id>      Show tenant logs
  update <tenant-id>    Update tenant to latest image
  backup <tenant-id>    Backup tenant data
  restore <tenant-id> <backup-date>  Restore tenant from backup
  remove <tenant-id>    Remove tenant (with confirmation)
  health-check          Check health of all tenants
  update-all            Update all tenants to latest version

Options:
  --follow             Follow logs (for logs command)
  --force              Force operation without confirmation
  --help               Show this help message

Examples:
  $0 list
  $0 status acme-corp
  $0 start acme-corp
  $0 logs acme-corp --follow
  $0 update-all
  $0 backup acme-corp
  $0 restore acme-corp 20241224

EOF
}

# Get list of tenants
get_tenants() {
    find . -maxdepth 1 -name ".env.*" -type f | sed 's/\.\///g' | sed 's/\.env\.//g' | sort
}

# Get tenant configuration - Windows safe environment loading
get_tenant_config() {
    local tenant_id="$1"
    local config_file=".env.$tenant_id"

    if [[ ! -f "$config_file" ]]; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    # Windows-safe environment loading
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ $line =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue

        # Export valid environment variables
        if [[ $line =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            export "$line"
        fi
    done < "$config_file"
}

# Check if tenant exists
tenant_exists() {
    local tenant_id="$1"
    [[ -f ".env.$tenant_id" ]]
}

# List all tenants
cmd_list() {
    local tenants=$(get_tenants)

    if [[ -z "$tenants" ]]; then
        log_warn "No tenants found"
        return 0
    fi

    echo "📋 Available Tenants:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "%-20s %-10s %-10s %-10s %-10s %s\n" "TENANT" "API_PORT" "WEB_PORT" "STATUS" "TIER" "CREATED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for tenant in $tenants; do
        get_tenant_config "$tenant" 2>/dev/null || continue

        # Check if services are running
        local running_containers=$(docker ps --filter "name=${PROJECT_PREFIX:-cw-rag}-${tenant}" --format "{{.Names}}" | wc -l)
        local status="stopped"
        if [[ $running_containers -gt 0 ]]; then
            status="running"
        fi

        # Get tier from environment or default
        local tier="${TIER:-basic}"

        # Get creation date from file
        local created=$(stat -c %y ".env.$tenant" 2>/dev/null | cut -d' ' -f1 || echo "unknown")

        printf "%-20s %-10s %-10s %-10s %-10s %s\n" \
            "$tenant" \
            "${API_PORT:-unknown}" \
            "${WEB_PORT:-unknown}" \
            "$status" \
            "$tier" \
            "$created"
    done
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Show tenant status
cmd_status() {
    local target_tenant="$1"
    local tenants

    if [[ -n "$target_tenant" ]]; then
        if ! tenant_exists "$target_tenant"; then
            log_error "Tenant $target_tenant not found"
            return 1
        fi
        tenants="$target_tenant"
    else
        tenants=$(get_tenants)
    fi

    for tenant in $tenants; do
        get_tenant_config "$tenant" || continue

        echo
        echo "🏢 Tenant: $tenant"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        # Container status
        echo "📦 Container Status:"
        docker-compose --env-file ".env.$tenant" -f "docker-compose.$tenant.yml" ps 2>/dev/null || echo "   No containers found"

        # Health checks
        echo
        echo "🏥 Health Status:"
        local api_health=$(curl -s "http://localhost:${API_PORT}/healthz" 2>/dev/null || echo "FAILED")
        local web_status=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${WEB_PORT}" 2>/dev/null || echo "FAILED")
        local qdrant_health=$(curl -s "http://localhost:${QDRANT_PORT}/healthz" 2>/dev/null || echo "FAILED")

        echo "   API:    $api_health"
        echo "   Web:    $web_status"
        echo "   Qdrant: $qdrant_health"

        # Resource usage
        echo
        echo "💾 Resource Usage:"
        local volume_name="${QDRANT_VOLUME_NAME}"
        if docker volume inspect "$volume_name" &>/dev/null; then
            local volume_size=$(docker system df -v | grep "$volume_name" | awk '{print $3}' || echo "unknown")
            echo "   Storage: $volume_size"
        else
            echo "   Storage: volume not found"
        fi

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    done
}

# Start tenant services
cmd_start() {
    local tenant_id="$1"

    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID required"
        return 1
    fi

    if ! tenant_exists "$tenant_id"; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    log_info "Starting tenant: $tenant_id"
    docker-compose --env-file ".env.$tenant_id" -f "docker-compose.$tenant_id.yml" up -d

    # Wait for health checks
    sleep 10
    log_info "Checking health..."
    cmd_status "$tenant_id"
}

# Stop tenant services
cmd_stop() {
    local tenant_id="$1"

    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID required"
        return 1
    fi

    if ! tenant_exists "$tenant_id"; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    log_info "Stopping tenant: $tenant_id"
    docker-compose --env-file ".env.$tenant_id" -f "docker-compose.$tenant_id.yml" down
}

# Restart tenant services
cmd_restart() {
    local tenant_id="$1"

    log_info "Restarting tenant: $tenant_id"
    cmd_stop "$tenant_id"
    sleep 5
    cmd_start "$tenant_id"
}

# Show tenant logs
cmd_logs() {
    local tenant_id="$1"
    local follow_flag=""

    if [[ "$2" == "--follow" ]]; then
        follow_flag="-f"
    fi

    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID required"
        return 1
    fi

    if ! tenant_exists "$tenant_id"; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    docker-compose --env-file ".env.$tenant_id" -f "docker-compose.$tenant_id.yml" logs $follow_flag
}

# Update tenant to latest image
cmd_update() {
    local tenant_id="$1"

    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID required"
        return 1
    fi

    if ! tenant_exists "$tenant_id"; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    log_info "Updating tenant: $tenant_id"

    # Pull latest images
    docker-compose --env-file ".env.$tenant_id" -f "docker-compose.$tenant_id.yml" pull

    # Rolling update
    docker-compose --env-file ".env.$tenant_id" -f "docker-compose.$tenant_id.yml" up -d --no-deps api web

    # Health check
    sleep 30
    get_tenant_config "$tenant_id"
    local health_check=$(curl -s "http://localhost:${API_PORT}/healthz" || echo "FAILED")

    if [[ "$health_check" == "FAILED" ]]; then
        log_error "Health check failed for $tenant_id after update"
        return 1
    else
        log_info "✅ Update successful for $tenant_id"
    fi
}

# Backup tenant data
cmd_backup() {
    local tenant_id="$1"

    if [[ -z "$tenant_id" ]]; then
        log_error "Tenant ID required"
        return 1
    fi

    if ! tenant_exists "$tenant_id"; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    get_tenant_config "$tenant_id"

    local backup_dir="backups/$tenant_id/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    log_info "Creating backup for tenant: $tenant_id"
    log_info "Backup location: $backup_dir"

    # Backup Qdrant data
    local volume_name="${QDRANT_VOLUME_NAME}"
    if docker volume inspect "$volume_name" &>/dev/null; then
        docker run --rm -v "$volume_name:/data" -v "$(pwd)/$backup_dir:/backup" alpine tar czf "/backup/qdrant-data.tar.gz" -C /data .
        log_info "✅ Qdrant data backed up"
    else
        log_warn "⚠️  Qdrant volume not found"
    fi

    # Backup configuration
    cp ".env.$tenant_id" "$backup_dir/"
    cp "docker-compose.$tenant_id.yml" "$backup_dir/"
    log_info "✅ Configuration backed up"

    # Create backup metadata
    cat > "$backup_dir/metadata.json" << EOF
{
  "tenant": "$tenant_id",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "api_port": ${API_PORT},
  "web_port": ${WEB_PORT},
  "qdrant_port": ${QDRANT_PORT},
  "backup_type": "full"
}
EOF

    log_info "✅ Backup completed: $backup_dir"
}

# Health check for all tenants
cmd_health_check() {
    local tenants=$(get_tenants)
    local failed_tenants=()

    log_info "Performing health check on all tenants..."
    echo

    for tenant in $tenants; do
        get_tenant_config "$tenant" || continue

        echo -n "🏢 $tenant: "

        local api_health=$(curl -s "http://localhost:${API_PORT}/healthz" 2>/dev/null)
        local web_status=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${WEB_PORT}" 2>/dev/null)

        if [[ "$api_health" =~ "ok" ]] && [[ "$web_status" == "200" ]]; then
            echo -e "${GREEN}✅ HEALTHY${NC}"
        else
            echo -e "${RED}❌ UNHEALTHY${NC} (API: $api_health, Web: $web_status)"
            failed_tenants+=("$tenant")
        fi
    done

    echo
    if [[ ${#failed_tenants[@]} -eq 0 ]]; then
        log_info "✅ All tenants are healthy"
    else
        log_warn "⚠️  Unhealthy tenants: ${failed_tenants[*]}"
        return 1
    fi
}

# Update all tenants
cmd_update_all() {
    local tenants=$(get_tenants)
    local failed_updates=()

    log_info "Updating all tenants..."

    for tenant in $tenants; do
        log_info "Updating tenant: $tenant"
        if cmd_update "$tenant"; then
            log_info "✅ Successfully updated $tenant"
        else
            log_error "❌ Failed to update $tenant"
            failed_updates+=("$tenant")
        fi
        echo
    done

    if [[ ${#failed_updates[@]} -eq 0 ]]; then
        log_info "✅ All tenants updated successfully"
    else
        log_warn "⚠️  Failed updates: ${failed_updates[*]}"
        return 1
    fi
}

# Parse command line arguments
COMMAND=""
FOLLOW_FLAG=""
FORCE_FLAG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --follow)
            FOLLOW_FLAG="--follow"
            shift
            ;;
        --force)
            FORCE_FLAG="--force"
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        --*)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            if [[ -z "$COMMAND" ]]; then
                COMMAND="$1"
            else
                ARGS="$ARGS $1"
            fi
            shift
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    "list")
        cmd_list
        ;;
    "status")
        cmd_status $ARGS
        ;;
    "start")
        cmd_start $ARGS
        ;;
    "stop")
        cmd_stop $ARGS
        ;;
    "restart")
        cmd_restart $ARGS
        ;;
    "logs")
        cmd_logs $ARGS $FOLLOW_FLAG
        ;;
    "update")
        cmd_update $ARGS
        ;;
    "backup")
        cmd_backup $ARGS
        ;;
    "health-check")
        cmd_health_check
        ;;
    "update-all")
        cmd_update_all
        ;;
    "")
        log_error "Command required"
        show_usage
        exit 1
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac