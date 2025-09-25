#!/bin/bash
# Check zenithfall tenant status

echo "=== Tenant: zenithfall ==="
echo "API Health: $(curl -s http://localhost:3000/healthz || echo 'FAILED')"
echo "Web Status: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001 || echo 'FAILED')"
echo "Qdrant Status: $(curl -s http://localhost:6333/healthz || echo 'FAILED')"
echo
docker-compose --env-file .env.zenithfall -f docker-compose.zenithfall.yml ps