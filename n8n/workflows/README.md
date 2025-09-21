# Obsidian Ingestion Workflows

This directory contains n8n workflows for ingesting Obsidian markdown files into the RAG system with full idempotency, tombstone support, and tenant isolation.

## Overview

### Workflows

1. **`obsidian-zenithfall.json`** - Production workflow specifically configured for the zenithfall tenant
2. **`obsidian-sync.json`** - Tenant-agnostic template workflow for creating additional tenant-specific instances

## Features

- ✅ **Idempotency**: Skip unchanged files using SHA256 content hashing
- ✅ **Tombstone Support**: Automatic cleanup of deleted files from vector store
- ✅ **Tenant Isolation**: Complete separation of tenant data and credentials
- ✅ **Cross-Platform**: Windows PowerShell and Unix/Linux compatibility
- ✅ **Enhanced Error Handling**: Comprehensive retry logic and error reporting
- ✅ **PII Policy Integration**: Preview and compliance checking before publication
- ✅ **Configurable Scheduling**: Flexible cron-based execution
- ✅ **Comprehensive Audit Logging**: Detailed execution tracking and metrics

## Quick Start

### 1. Zenithfall Workflow (Production Ready)

The zenithfall workflow is pre-configured and ready to use:

```bash
# Import into n8n
# Copy contents of obsidian-zenithfall.json and import via n8n UI
```

**Required Environment Variables:**
```bash
API_URL=http://api:3000
```

**Required Credentials:**
- Create credential named `zenithfallIngestToken` with your ingest token

### 2. Template Workflow (For Additional Tenants)

Use the template workflow to create instances for other tenants:

**Required Environment Variables:**
```bash
# Core Configuration
OBSIDIAN_VAULT_PATH=/path/to/vault
TENANT_ID=your-tenant-id
API_URL=http://api:3000

# Optional Configuration
BATCH_SIZE=10
MAX_FILES_PER_RUN=100
FILE_EXTENSIONS=.md,.markdown
EXCLUDE_PATHS=.obsidian,.trash,templates
INCREMENTAL_SYNC=true
DEFAULT_ACL=public
SOURCE_NAME=obsidian
DEFAULT_LANG=en
USE_IDEMPOTENCY=true
ENABLE_TOMBSTONES=true
CREDENTIAL_NAME=yourTenantIngestToken

# Timeout Configuration
REQUEST_TIMEOUT=45000
MAX_RETRIES=3
RETRY_DELAY=2000
PUBLISH_TIMEOUT=120000
PUBLISH_MAX_RETRIES=5
PUBLISH_RETRY_DELAY=3000
TOMBSTONE_TIMEOUT=60000
TOMBSTONE_MAX_RETRIES=5
TOMBSTONE_RETRY_DELAY=2000
```

## Detailed Configuration

### Environment Variables

#### Core Settings (Required)
- `OBSIDIAN_VAULT_PATH`: Full path to Obsidian vault directory
- `TENANT_ID`: Unique tenant identifier
- `API_URL`: Base URL of the ingestion API

#### Processing Settings (Optional)
- `BATCH_SIZE` (default: 10): Documents per processing batch
- `MAX_FILES_PER_RUN` (default: 100): Maximum files processed per execution
- `FILE_EXTENSIONS` (default: .md,.markdown): Comma-separated file extensions
- `EXCLUDE_PATHS` (default: .obsidian,.trash,templates): Comma-separated paths to exclude

#### Feature Flags (Optional)
- `INCREMENTAL_SYNC` (default: true): Only process files modified since last run
- `USE_IDEMPOTENCY` (default: true): Skip unchanged files using content hashing
- `ENABLE_TOMBSTONES` (default: true): Create tombstones for deleted files

#### Content Settings (Optional)
- `DEFAULT_ACL` (default: public): Default access control list
- `SOURCE_NAME` (default: obsidian): Source identifier for documents
- `DEFAULT_LANG` (default: en): Default language for documents

#### Timeout and Retry Settings (Optional)
- `REQUEST_TIMEOUT` (default: 45000): Preview request timeout (ms)
- `MAX_RETRIES` (default: 3): Preview request max retries
- `RETRY_DELAY` (default: 2000): Preview request retry delay (ms)
- `PUBLISH_TIMEOUT` (default: 120000): Publish request timeout (ms)
- `PUBLISH_MAX_RETRIES` (default: 5): Publish request max retries
- `PUBLISH_RETRY_DELAY` (default: 3000): Publish request retry delay (ms)
- `TOMBSTONE_TIMEOUT` (default: 60000): Tombstone request timeout (ms)
- `TOMBSTONE_MAX_RETRIES` (default: 5): Tombstone request max retries
- `TOMBSTONE_RETRY_DELAY` (default: 2000): Tombstone request retry delay (ms)

### Credential Configuration

#### Zenithfall Workflow
Create a credential named `zenithfallIngestToken`:
1. Go to n8n Credentials
2. Create new credential of type "API Key"
3. Name: `zenithfallIngestToken`
4. Key: `token`
5. Value: Your actual ingest token

#### Template Workflow
Set `CREDENTIAL_NAME` environment variable to your credential name:
1. Create credential with appropriate name (e.g., `myTenantIngestToken`)
2. Set `CREDENTIAL_NAME=myTenantIngestToken`

## Document Processing

### DocId Generation
Documents are assigned docIds based on their vault-relative path with forward slashes:
```
Vault: /path/to/vault
File: /path/to/vault/Projects/MyProject/notes.md
DocId: Projects/MyProject/notes
```

### Frontmatter Support
The workflow parses YAML frontmatter for metadata:
```yaml
---
title: Custom Title
tags: [tag1, tag2]
acl: [public, admin]
author: John Doe
lang: en
version: 1.0
---
# Document Content
```

### Content Parsing
- Splits content into blocks by headers
- Detects code blocks (```), tables (|, ---), and text
- Preserves original formatting

## Workflow Execution

### Idempotency Logic
1. **First Run**: Processes all files, stores content hashes
2. **Subsequent Runs**:
   - Compares current file hash with stored hash
   - Skips unchanged files (logged as "SKIP")
   - Processes new/modified files (logged as "PROCESS")

### Tombstone Handling
1. **Deletion Detection**: Compares current file list with previous run
2. **Tombstone Creation**: Creates special documents with `deleted: true`
3. **Vector Cleanup**: API handles removal of vector embeddings
4. **Audit Trail**: Logs all deletion operations

### Error Handling
- **File Errors**: Logs and skips individual problematic files
- **API Errors**: Automatic retry with exponential backoff
- **Batch Errors**: Continues processing remaining batches
- **Global Errors**: Comprehensive error logging and state preservation

## Monitoring and Logging

### Execution Logs
Each run provides comprehensive logging:
```
ZENITHFALL OBSIDIAN SYNC COMPLETE
=====================================
Vault: C:\Users\gabmi\OneDrive\Documents\Zenithfall
Timestamp: 2024-01-01T12:00:00.000Z
Configuration: batch=5, incremental=true, idempotency=true, tombstones=true
Batches: 3 published, 0 blocked
Documents: 15 published, 2 updated, 0 blocked, 0 errors, 5 skipped
Tombstones: 1 created
Files tracked: 22
=====================================
```

### State Persistence
Workflows maintain state between runs:
- `lastRunTime`: Timestamp of last successful execution
- `fileHashes`: Content hashes for idempotency
- `previousFiles`: File list for tombstone detection
- `lastError`: Details of last error for debugging

## Testing

### Manual Testing
1. **Import Workflow**: Copy JSON and import via n8n UI
2. **Configure Environment**: Set required environment variables
3. **Create Credentials**: Set up ingest token credential
4. **Manual Trigger**: Execute workflow manually
5. **Check Logs**: Review execution logs for success/errors

### Validation Checklist
- [ ] Files processed correctly on first run
- [ ] Idempotency works (second run skips unchanged files)
- [ ] Tombstones created for deleted files
- [ ] Error handling works for invalid files
- [ ] PII policy integration functions
- [ ] Batch processing handles large vaults
- [ ] Cross-platform file discovery works

## Troubleshooting

### Common Issues

#### "Missing required environment variables"
- Ensure `OBSIDIAN_VAULT_PATH` and `TENANT_ID` are set
- Check environment variable syntax (no spaces around =)

#### "Invalid or missing x-ingest-token"
- Verify credential name matches workflow expectation
- Check credential configuration and token value
- Ensure API_URL is correct

#### "No markdown files found in vault"
- Verify vault path exists and contains .md files
- Check file permissions for vault directory
- Review EXCLUDE_PATHS configuration

#### "File discovery command failed"
- On Windows: Ensure PowerShell is available
- On Unix/Linux: Verify find command and path syntax
- Check vault path for special characters

### Performance Tuning

#### For Large Vaults (1000+ files)
```bash
BATCH_SIZE=5           # Smaller batches for stability
MAX_FILES_PER_RUN=200  # Process subset per run
REQUEST_TIMEOUT=60000  # Longer timeouts
PUBLISH_TIMEOUT=180000 # Extended publish timeout
```

#### For Frequent Updates
```bash
INCREMENTAL_SYNC=true  # Only process modified files
USE_IDEMPOTENCY=true   # Skip unchanged content
BATCH_SIZE=15          # Larger batches for efficiency
```

#### For Initial Migration
```bash
USE_IDEMPOTENCY=false  # Process all files
ENABLE_TOMBSTONES=false # Skip deletion checking
MAX_FILES_PER_RUN=50   # Limit initial load
```

## Advanced Configuration

### Custom Scheduling
Modify cron expression in workflow:
```javascript
// Every 15 minutes
"expression": "0 */15 * * * *"

// Every hour at minute 0
"expression": "0 0 * * * *"

// Every day at 2 AM
"expression": "0 0 2 * * *"

// Every Monday at 9 AM
"expression": "0 0 9 * * 1"
```

### Multi-Tenant Setup
1. Create separate credentials for each tenant
2. Deploy template workflow per tenant
3. Configure unique environment variables per instance
4. Use tenant-specific vault paths and identifiers

### Integration with External Systems
Environment variables for alerting hooks:
```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
EMAIL_ALERT_ENDPOINT=https://api.sendgrid.com/...
TEAMS_WEBHOOK_URL=https://outlook.office.com/...
```

## Security Considerations

### Access Control
- Use least-privilege credentials for ingest tokens
- Restrict vault directory permissions appropriately
- Configure ACL policies in frontmatter for sensitive content

### Data Protection
- PII policy integration prevents sensitive data ingestion
- Tombstone functionality ensures complete data removal
- Audit logging provides compliance traceability

### Network Security
- Use HTTPS for API_URL in production
- Configure proper firewall rules for n8n access
- Consider VPN or private network deployment

## Support

### Getting Help
1. Review execution logs in n8n workflow history
2. Check environment variable configuration
3. Verify API connectivity and credentials
4. Test with minimal vault subset first

### Reporting Issues
Include in bug reports:
- Workflow version and configuration
- Environment variables (sanitized)
- Error logs and stack traces
- Sample vault structure (if relevant)
- Platform details (Windows/Linux/Docker)