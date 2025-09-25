#!/bin/bash
# Start gabmichels tenant services

docker-compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml up -d
