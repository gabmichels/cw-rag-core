#!/bin/bash
# Check gabmichels tenant status

echo "=== Tenant: gabmichels ==="
echo "API Health: $(curl -s http://localhost:3200/healthz || echo 'FAILED')"
echo "Web Status: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3201 || echo 'FAILED')"
echo "Qdrant Status: $(curl -s http://localhost:6533/healthz || echo 'FAILED')"
echo
docker-compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml ps
