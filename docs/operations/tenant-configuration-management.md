# Tenant Configuration Management

## Overview

This document outlines the comprehensive approach to managing configurations for multiple tenants in the cw-rag-core system, ensuring consistent, secure, and maintainable configuration management across all tenant deployments.

## Configuration Architecture

### Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          CONFIGURATION HIERARCHY                                    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                            GLOBAL DEFAULTS                                  │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │  Core Settings  │  │  Base Images    │  │    Shared Constants         │   │   │
│  │  │                 │  │                 │  │                             │   │   │
│  │  │ • Vector dim    │  │ • Node.js base  │  │ • Default timeouts          │   │   │
│  │  │ • Model paths   │  │ • Qdrant image  │  │ • Network settings          │   │   │
│  │  │ • Service ports │  │ • Web base      │  │ • Health check intervals    │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                           │
│                                        ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                             TIER OVERRIDES                                  │   │
│  │                                                                             │   │
│  │  ┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │     Basic     │  │     Premium     │  │         Enterprise          │   │   │
│  │  │               │  │                 │  │                             │   │   │
│  │  │ • 500 req/min │  │ • 2K req/min    │  │ • 10K req/min               │   │   │
│  │  │ • 10K docs    │  │ • 50K docs      │  │ • 500K docs                 │   │   │
│  │  │ • 5GB storage │  │ • 25GB storage  │  │ • 100GB storage             │   │   │
│  │  │ • Basic PII   │  │ • Strict PII    │  │ • Custom PII rules          │   │   │
│  │  └───────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                           │
│                                        ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                        TENANT-SPECIFIC OVERRIDES                            │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │   ACME Corp     │  │   Client XYZ    │  │      Healthcare Inc         │   │   │
│  │  │                 │  │                 │  │                             │   │   │
│  │  │ • Custom ports  │  │ • Custom domain │  │ • HIPAA compliance          │   │   │
│  │  │ • Special SLA   │  │ • Extended SLA  │  │ • Custom retention          │   │   │
│  │  │ • Branding      │  │ • API limits    │  │ • Audit logging             │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Configuration Sources

### 1. Base Configuration Template

```bash
# config/templates/base.env
# Base configuration template for all tenants

# Core System Settings (rarely changed)
VECTOR_DIM=384
EMBEDDINGS_MODEL=bge-small-en-v1.5
EMBEDDINGS_PROVIDER=local
QDRANT_COLLECTION=docs_v1

# Default Timeout Configuration
VECTOR_SEARCH_TIMEOUT_MS=5000
KEYWORD_SEARCH_TIMEOUT_MS=3000
RERANKER_TIMEOUT_MS=10000
LLM_TIMEOUT_MS=25000
OVERALL_TIMEOUT_MS=45000
EMBEDDING_TIMEOUT_MS=5000

# Default Rate Limiting
RATE_LIMIT_PER_IP=30
RATE_LIMIT_WINDOW_MINUTES=1

# Default Health Check Settings
HEALTHCHECK_INTERVAL=15s
HEALTHCHECK_TIMEOUT=10s
HEALTHCHECK_RETRIES=3

# Default Security Settings
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_HEADERS=Content-Type,Authorization,x-ingest-token,x-tenant
```

### 2. Tier-Specific Configuration

```bash
# config/tiers/basic.env
TIER=basic
RATE_LIMIT_PER_USER=50
RATE_LIMIT_PER_TENANT=500
MAX_DOCUMENTS=10000
STORAGE_QUOTA_GB=5
PII_POLICY=BASIC
API_CPU_LIMIT=0.5
API_MEMORY_LIMIT=512M
QDRANT_CPU_LIMIT=1.0
QDRANT_MEMORY_LIMIT=2G

# config/tiers/premium.env
TIER=premium
RATE_LIMIT_PER_USER=200
RATE_LIMIT_PER_TENANT=2000
MAX_DOCUMENTS=50000
STORAGE_QUOTA_GB=25
PII_POLICY=STRICT
API_CPU_LIMIT=1.0
API_MEMORY_LIMIT=1G
QDRANT_CPU_LIMIT=2.0
QDRANT_MEMORY_LIMIT=4G

# config/tiers/enterprise.env
TIER=enterprise
RATE_LIMIT_PER_USER=1000
RATE_LIMIT_PER_TENANT=10000
MAX_DOCUMENTS=500000
STORAGE_QUOTA_GB=100
PII_POLICY=CUSTOM
API_CPU_LIMIT=2.0
API_MEMORY_LIMIT=2G
QDRANT_CPU_LIMIT=4.0
QDRANT_MEMORY_LIMIT=8G
CUSTOM_FEATURES_ENABLED=true
ADVANCED_ANALYTICS=true
```

### 3. Tenant-Specific Overrides

```bash
# tenants/acme-corp/overrides.env
# Custom settings for ACME Corporation

# Custom branding
TENANT_LOGO_URL=https://acme-corp.com/logo.png
TENANT_COLORS_PRIMARY=#FF6B35
TENANT_COLORS_SECONDARY=#004E64
CUSTOM_DOMAIN=rag.acme-corp.com

# Custom business rules
DOCUMENT_RETENTION_DAYS=2555  # 7 years for compliance
REQUIRE_DOCUMENT_APPROVAL=true
ENABLE_AUDIT_TRAIL=true

# Integration settings
SLACK_WEBHOOK_URL=https://example.com/slack-webhook-placeholder
TEAMS_WEBHOOK_URL=https://example.com/teams-webhook-placeholder

# Custom PII rules
PII_CUSTOM_PATTERNS=["ACME-\\d{6}", "PROJ-[A-Z]{3}-\\d{4}"]
PII_WHITELIST_DOMAINS=["acme-corp.com", "acme.internal"]
```

## Configuration Management Scripts

### Configuration Generator

```bash
#!/bin/bash
# scripts/generate-tenant-config.sh

generate_tenant_config() {
    local tenant_id="$1"
    local tier="$2"
    local custom_settings="$3"

    local output_file=".env.$tenant_id"

    log_info "Generating configuration for tenant: $tenant_id (tier: $tier)"

    # Start with base configuration
    cp "config/templates/base.env" "$output_file"

    # Add tier-specific settings
    if [[ -f "config/tiers/$tier.env" ]]; then
        cat "config/tiers/$tier.env" >> "$output_file"
    else
        log_error "Tier configuration not found: $tier"
        return 1
    fi

    # Add tenant-specific overrides
    if [[ -f "tenants/$tenant_id/overrides.env" ]]; then
        cat "tenants/$tenant_id/overrides.env" >> "$output_file"
    fi

    # Apply dynamic settings
    apply_dynamic_settings "$tenant_id" "$output_file"

    # Validate configuration
    validate_tenant_config "$output_file"

    log_info "✅ Configuration generated: $output_file"
}

apply_dynamic_settings() {
    local tenant_id="$1"
    local config_file="$2"

    # Generate unique ports
    local api_port=$(find_available_port 3000)
    local web_port=$(find_available_port 3001)
    local qdrant_port=$(find_available_port 6333)

    # Add dynamic settings
    cat >> "$config_file" << EOF

# Dynamic Settings (Auto-generated)
TENANT=$tenant_id
PROJECT_PREFIX=cw-rag
GENERATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Port Configuration
API_PORT=$api_port
WEB_PORT=$web_port
QDRANT_PORT=$qdrant_port
QDRANT_GRPC_PORT=$((qdrant_port + 1))

# Container Names
API_CONTAINER_NAME=cw-rag-${tenant_id}-api
WEB_CONTAINER_NAME=cw-rag-${tenant_id}-web
QDRANT_CONTAINER_NAME=cw-rag-${tenant_id}-qdrant

# Volume Names
QDRANT_VOLUME_NAME=cw_rag_${tenant_id//-/_}_qdrant_storage
NETWORK_NAME=cw-rag-${tenant_id}-network

# Security
INGEST_TOKEN=${tenant_id}-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
CORS_ORIGIN=http://localhost:$web_port

# Public URLs
NEXT_PUBLIC_API_URL=http://localhost:$api_port
EOF
}

validate_tenant_config() {
    local config_file="$1"

    # Check required variables
    local required_vars=(
        "TENANT"
        "API_PORT"
        "WEB_PORT"
        "QDRANT_PORT"
        "INGEST_TOKEN"
        "TIER"
    )

    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$config_file"; then
            log_error "Missing required variable: $var"
            return 1
        fi
    done

    # Validate port availability
    local api_port=$(grep "^API_PORT=" "$config_file" | cut -d= -f2)
    if netstat -tuln 2>/dev/null | grep -q ":$api_port "; then
        log_error "Port $api_port is already in use"
        return 1
    fi

    log_info "✅ Configuration validation passed"
}
```

### Configuration Update Manager

```bash
#!/bin/bash
# scripts/update-tenant-configs.sh

update_tenant_configs() {
    local update_type="$1"  # global, tier, or tenant-specific
    local target="$2"       # specific tier or tenant

    case "$update_type" in
        "global")
            update_global_settings
            ;;
        "tier")
            update_tier_settings "$target"
            ;;
        "tenant")
            update_tenant_settings "$target"
            ;;
        *)
            log_error "Invalid update type: $update_type"
            return 1
            ;;
    esac
}

update_global_settings() {
    log_info "Updating global settings for all tenants"

    local tenants=$(get_all_tenants)
    local backup_dir="backups/config-update-$(date +%Y%m%d_%H%M%S)"

    # Backup existing configurations
    mkdir -p "$backup_dir"
    for tenant in $tenants; do
        cp ".env.$tenant" "$backup_dir/"
    done

    # Apply updates
    for tenant in $tenants; do
        log_info "Updating configuration for tenant: $tenant"

        # Get current tier
        local tier=$(grep "^TIER=" ".env.$tenant" | cut -d= -f2)

        # Regenerate configuration preserving custom settings
        backup_custom_settings "$tenant"
        generate_tenant_config "$tenant" "$tier"
        restore_custom_settings "$tenant"

        # Validate new configuration
        if validate_tenant_config ".env.$tenant"; then
            log_info "✅ Updated $tenant successfully"
        else
            log_error "❌ Failed to update $tenant - restoring backup"
            cp "$backup_dir/.env.$tenant" ".env.$tenant"
        fi
    done
}

backup_custom_settings() {
    local tenant="$1"
    local config_file=".env.$tenant"

    # Extract custom settings (lines added after generation)
    grep -E "^CUSTOM_|^TENANT_|^SLACK_|^TEAMS_" "$config_file" > "tmp.$tenant.custom" 2>/dev/null || true
}

restore_custom_settings() {
    local tenant="$1"
    local config_file=".env.$tenant"

    # Append custom settings back
    if [[ -f "tmp.$tenant.custom" ]]; then
        echo "" >> "$config_file"
        echo "# Custom Settings" >> "$config_file"
        cat "tmp.$tenant.custom" >> "$config_file"
        rm "tmp.$tenant.custom"
    fi
}
```

## Configuration Validation

### Validation Schema

```json
{
  "tenant_config_schema": {
    "required": [
      "TENANT",
      "TIER",
      "API_PORT",
      "WEB_PORT",
      "QDRANT_PORT",
      "INGEST_TOKEN",
      "RATE_LIMIT_PER_TENANT",
      "MAX_DOCUMENTS"
    ],
    "properties": {
      "TENANT": {
        "type": "string",
        "pattern": "^[a-z0-9-]+$",
        "minLength": 2,
        "maxLength": 50
      },
      "TIER": {
        "type": "string",
        "enum": ["basic", "premium", "enterprise"]
      },
      "API_PORT": {
        "type": "integer",
        "minimum": 3000,
        "maximum": 65535
      },
      "RATE_LIMIT_PER_TENANT": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100000
      },
      "MAX_DOCUMENTS": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 10000000
      },
      "PII_POLICY": {
        "type": "string",
        "enum": ["OFF", "BASIC", "STRICT", "CUSTOM"]
      }
    }
  }
}
```

### Validation Script

```bash
#!/bin/bash
# scripts/validate-config.sh

validate_all_configs() {
    local tenants=$(get_all_tenants)
    local validation_errors=()

    for tenant in $tenants; do
        log_info "Validating configuration for tenant: $tenant"

        if validate_tenant_config ".env.$tenant"; then
            log_info "✅ $tenant configuration is valid"
        else
            log_error "❌ $tenant configuration has errors"
            validation_errors+=("$tenant")
        fi
    done

    if [[ ${#validation_errors[@]} -eq 0 ]]; then
        log_info "✅ All tenant configurations are valid"
        return 0
    else
        log_error "❌ Configuration errors found in: ${validation_errors[*]}"
        return 1
    fi
}

validate_config_consistency() {
    local config_file="$1"

    # Check for port conflicts
    local api_port=$(grep "^API_PORT=" "$config_file" | cut -d= -f2)
    local web_port=$(grep "^WEB_PORT=" "$config_file" | cut -d= -f2)
    local qdrant_port=$(grep "^QDRANT_PORT=" "$config_file" | cut -d= -f2)

    local all_ports=("$api_port" "$web_port" "$qdrant_port")
    local unique_ports=($(printf "%s\n" "${all_ports[@]}" | sort -u))

    if [[ ${#all_ports[@]} -ne ${#unique_ports[@]} ]]; then
        log_error "Port conflicts detected in $config_file"
        return 1
    fi

    # Check resource limits consistency
    local tier=$(grep "^TIER=" "$config_file" | cut -d= -f2)
    local rate_limit=$(grep "^RATE_LIMIT_PER_TENANT=" "$config_file" | cut -d= -f2)

    case "$tier" in
        "basic")
            if [[ $rate_limit -gt 500 ]]; then
                log_error "Rate limit too high for basic tier: $rate_limit"
                return 1
            fi
            ;;
        "premium")
            if [[ $rate_limit -gt 2000 ]]; then
                log_error "Rate limit too high for premium tier: $rate_limit"
                return 1
            fi
            ;;
    esac

    return 0
}
```

## Secrets Management

### Secrets Structure

```bash
# secrets/
# ├── global/
# │   ├── database.env
# │   ├── registry.env
# │   └── monitoring.env
# ├── tenants/
# │   ├── acme-corp/
# │   │   ├── api-keys.env
# │   │   ├── webhooks.env
# │   │   └── certificates/
# │   └── client-xyz/
# │       ├── api-keys.env
# │       └── webhooks.env
# └── templates/
#     ├── tenant-secrets.env.template
#     └── api-keys.env.template
```

### Secret Generation

```bash
#!/bin/bash
# scripts/manage-secrets.sh

generate_tenant_secrets() {
    local tenant_id="$1"
    local secrets_dir="secrets/tenants/$tenant_id"

    mkdir -p "$secrets_dir"

    # Generate API keys
    cat > "$secrets_dir/api-keys.env" << EOF
# API Keys for $tenant_id
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HUGGINGFACE_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Internal service keys
INTERNAL_SERVICE_KEY=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
EOF

    # Generate webhook configurations
    cat > "$secrets_dir/webhooks.env" << EOF
# Webhook configurations for $tenant_id
SLACK_WEBHOOK_URL=https://example.com/slack-webhook-placeholder
TEAMS_WEBHOOK_URL=https://example.com/teams-webhook-placeholder
DISCORD_WEBHOOK_URL=https://example.com/discord-webhook-placeholder
CUSTOM_WEBHOOK_URL=https://example.com/custom-webhook-placeholder

# Webhook authentication
WEBHOOK_AUTH_TOKEN=$(openssl rand -hex 16)
EOF

    # Set appropriate permissions
    chmod 600 "$secrets_dir"/*.env

    log_info "✅ Secrets generated for tenant: $tenant_id"
}

rotate_tenant_secrets() {
    local tenant_id="$1"
    local secret_type="$2"  # api-keys, webhooks, or all

    local secrets_dir="secrets/tenants/$tenant_id"
    local backup_dir="secrets/backups/$tenant_id/$(date +%Y%m%d_%H%M%S)"

    # Backup existing secrets
    mkdir -p "$backup_dir"
    cp -r "$secrets_dir"/* "$backup_dir/"

    case "$secret_type" in
        "api-keys")
            rotate_api_keys "$tenant_id"
            ;;
        "webhooks")
            rotate_webhook_secrets "$tenant_id"
            ;;
        "all")
            rotate_api_keys "$tenant_id"
            rotate_webhook_secrets "$tenant_id"
            ;;
        *)
            log_error "Invalid secret type: $secret_type"
            return 1
            ;;
    esac

    log_info "✅ Secrets rotated for tenant: $tenant_id"
}
```

### Secret Injection

```bash
#!/bin/bash
# scripts/inject-secrets.sh

inject_secrets_to_config() {
    local tenant_id="$1"
    local config_file=".env.$tenant_id"
    local secrets_file="secrets/tenants/$tenant_id/api-keys.env"

    if [[ ! -f "$secrets_file" ]]; then
        log_error "Secrets file not found: $secrets_file"
        return 1
    fi

    # Create temporary file with secrets injected
    local temp_file=$(mktemp)

    # Copy main config
    cp "$config_file" "$temp_file"

    # Add secrets section
    echo "" >> "$temp_file"
    echo "# Secrets (injected at runtime)" >> "$temp_file"
    cat "$secrets_file" >> "$temp_file"

    # Replace original config
    mv "$temp_file" "$config_file"

    # Set appropriate permissions
    chmod 600 "$config_file"

    log_info "✅ Secrets injected for tenant: $tenant_id"
}
```

## Configuration Monitoring

### Configuration Drift Detection

```bash
#!/bin/bash
# scripts/detect-config-drift.sh

detect_configuration_drift() {
    local tenant_id="$1"
    local config_file=".env.$tenant_id"
    local expected_config="config/expected/$tenant_id.env"

    if [[ ! -f "$expected_config" ]]; then
        log_warn "No expected configuration found for $tenant_id"
        return 0
    fi

    # Compare configurations
    local differences=$(diff -u "$expected_config" "$config_file" | grep -E "^[+-]" | grep -v "^[+-]{3}")

    if [[ -n "$differences" ]]; then
        log_warn "Configuration drift detected for $tenant_id:"
        echo "$differences"

        # Generate drift report
        cat > "reports/config-drift-$tenant_id-$(date +%Y%m%d).txt" << EOF
Configuration Drift Report
Tenant: $tenant_id
Date: $(date)

Differences:
$differences

Recommended Actions:
1. Review changes for security implications
2. Update expected configuration if changes are intentional
3. Revert to expected configuration if changes are unintentional
EOF

        return 1
    else
        log_info "✅ No configuration drift detected for $tenant_id"
        return 0
    fi
}

monitor_all_tenants() {
    local tenants=$(get_all_tenants)
    local drift_detected=()

    for tenant in $tenants; do
        if ! detect_configuration_drift "$tenant"; then
            drift_detected+=("$tenant")
        fi
    done

    if [[ ${#drift_detected[@]} -gt 0 ]]; then
        log_warn "Configuration drift detected in: ${drift_detected[*]}"
        # Send alert if monitoring system is configured
        send_drift_alert "${drift_detected[*]}"
    fi
}
```

### Automated Configuration Backup

```bash
#!/bin/bash
# scripts/backup-configurations.sh

backup_all_configurations() {
    local backup_dir="backups/configurations/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # Backup all tenant configurations
    for config_file in .env.*; do
        if [[ "$config_file" != ".env.example" ]]; then
            cp "$config_file" "$backup_dir/"
        fi
    done

    # Backup configuration templates
    cp -r config/ "$backup_dir/"

    # Backup secrets (without sensitive values)
    mkdir -p "$backup_dir/secrets-structure"
    find secrets/ -name "*.env" -exec basename {} \; > "$backup_dir/secrets-structure/files.txt"

    # Create backup metadata
    cat > "$backup_dir/metadata.json" << EOF
{
  "backup_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tenant_count": $(ls .env.* | grep -v .env.example | wc -l),
  "backup_type": "full_configuration",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
}
EOF

    # Compress backup
    tar czf "backups/config-backup-$(date +%Y%m%d_%H%M%S).tar.gz" -C backups/configurations .

    # Clean up old backups (keep last 30 days)
    find backups/ -name "config-backup-*.tar.gz" -mtime +30 -delete

    log_info "✅ Configuration backup completed: $backup_dir"
}
```

## Configuration Best Practices

### ✅ DO
- Use hierarchical configuration with clear inheritance
- Validate all configurations before deployment
- Implement automated configuration backups
- Use secrets management for sensitive data
- Monitor for configuration drift
- Version control configuration templates
- Implement configuration rollback procedures
- Document all configuration changes
- Use consistent naming conventions
- Implement configuration validation schemas

### ❌ DON'T
- Store secrets in plain text configuration files
- Modify configurations directly in production without testing
- Use hardcoded values instead of configurable parameters
- Skip configuration validation steps
- Mix tenant-specific settings in global configurations
- Deploy without backing up existing configurations
- Allow manual configuration changes without documentation
- Use default or weak security tokens
- Ignore configuration drift alerts
- Share configuration files between different environments

## Troubleshooting Configuration Issues

### Common Problems

1. **Port Conflicts**
   ```bash
   # Detect port conflicts
   ./scripts/validate-config.sh --check-ports

   # Auto-resolve by reassigning ports
   ./scripts/reassign-ports.sh <tenant-id>
   ```

2. **Missing Required Variables**
   ```bash
   # Validate all required variables
   ./scripts/validate-config.sh --check-required

   # Generate missing variables
   ./scripts/fix-missing-vars.sh <tenant-id>
   ```

3. **Configuration Drift**
   ```bash
   # Detect and report drift
   ./scripts/detect-config-drift.sh <tenant-id>

   # Reset to expected configuration
   ./scripts/reset-config.sh <tenant-id>
   ```

4. **Secrets Management Issues**
   ```bash
   # Regenerate compromised secrets
   ./scripts/rotate-secrets.sh <tenant-id> all

   # Validate secret injection
   ./scripts/validate-secrets.sh <tenant-id>
   ```

---

This comprehensive configuration management system ensures consistent, secure, and maintainable tenant configurations while enabling easy updates and monitoring across all deployments.