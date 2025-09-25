#!/bin/bash
# Stop zenithfall tenant services

docker-compose --env-file .env.zenithfall -f docker-compose.zenithfall.yml down