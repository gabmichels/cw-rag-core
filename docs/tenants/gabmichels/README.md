# Tenant: gabmichels

## Configuration

- **Tier**: premium
- **Created**: 2025-09-25 01:14:10 UTC
- **PII Policy**: BASIC

## Access Information

- **API Endpoint**: http://localhost:3200
- **Web Interface**: http://localhost:3201
- **Qdrant Dashboard**: http://localhost:6533/dashboard

## Limits

- **Max Documents**: 50000
- **Rate Limit**: 2000 requests/minute
- **Storage Quota**: 25GB

## Management Commands

```bash
# Start services
./scripts/tenants/gabmichels/start.sh

# Stop services
./scripts/tenants/gabmichels/stop.sh

# Check status
./scripts/tenants/gabmichels/status.sh
```

## Security

- **Ingest Token**: `gabmichels-secure-token-2025`
- **Network**: Isolated Docker network
- **Data**: Tenant-specific volumes

## Next Steps

1. Start the tenant services: `./scripts/tenants/gabmichels/start.sh`
2. Verify health: `./scripts/tenants/gabmichels/status.sh`
3. Test document ingestion (see main documentation)
4. Configure monitoring and alerting
