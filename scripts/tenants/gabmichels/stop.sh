#!/bin/bash
# Stop gabmichels tenant services

docker-compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml down
