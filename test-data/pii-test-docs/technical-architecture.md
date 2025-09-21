# Zenithfall Technical Architecture

## System Overview
Zenithfall implements a cutting-edge RAG (Retrieval-Augmented Generation) system designed for enterprise document management and intelligent search capabilities.

## Key Features
- **Vector Search**: Powered by Qdrant with 384-dimensional embeddings
- **Multi-tenant Architecture**: Isolated data per tenant
- **PII Detection**: Advanced privacy protection with configurable policies
- **Semantic Search**: BGE-small-en-v1.5 embeddings for high-quality retrieval

## API Endpoints
- Health Check: GET /healthz
- Readiness Check: GET /readyz  
- Document Upload: POST /ingest/upload
- Search: POST /ask

## Configuration
The system supports various vector dimensions and embedding models. Current configuration uses 384-dimensional vectors optimized for performance and accuracy.

## Security Model
Authentication via API tokens, CORS protection, and rate limiting ensure secure operations. All document processing includes PII scanning and optional masking based on tenant policies.

Contact the development team at dev-team@zenithfall.com for technical questions or integration support.
