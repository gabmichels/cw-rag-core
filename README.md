# RAG System Documentation

## 1. Overview & Architecture

This project provides a robust RAG (Retrieval-Augmented Generation) system designed to accelerate information retrieval and response generation. It leverages a modern stack, including Next.js for the web interface, Fastify for a high-performance API, Qdrant as a vector database for semantic search, and n8n for workflow automation.

The architecture is composed of several key services that communicate to deliver a seamless experience:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    Web      │───▶│     API     │───▶│   Qdrant    │
│ (Next.js)   │    │ (Fastify)   │    │ (Vector DB) │
│  :3001      │    │   :3000     │    │   :6333     │
└─────────────┘    └─────────────┘    └─────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │     n8n     │
                   │ (Workflows) │
                   │   :5678     │
                   └─────────────┘
```

- **Web (Next.js)**: The frontend application, providing the user interface for interaction with the RAG system. Runs on port `3001`.
- **API (Fastify)**: The backend API, handling requests from the web application, orchestrating data flow, and interacting with Qdrant and n8n. Runs on port `3000`.
- **Qdrant (Vector DB)**: A high-performance vector similarity search engine, used for storing and retrieving vector embeddings of data. Runs on port `6333` (gRPC) and `6334` (HTTP).
- **n8n (Workflows)**: A powerful workflow automation tool, used for data ingestion, normalization, and other background processes. Runs on port `5678`.

## 2. Prerequisites

To get this project up and running, you'll need the following installed on your system:

-   [Node.js](https://nodejs.org/) (LTS version, e.g., v18.x or v20.x)
-   [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/) (pnpm is recommended as per `pnpm-workspace.yaml`)
-   [Docker](https://www.docker.com/products/docker-desktop) and [Docker Compose](https://docs.docker.com/compose/)
-   [Git](https://git-scm.com/)

## 3. Quick Start

This section will help you get the entire project stack running with a single command.

### One-command Spin-up

To start all services, navigate to the `ops/compose` directory and run:

```bash
cd ops/compose
docker-compose up --build -d
```

This command will:
1. Build the Docker images for the `api` and `web` services.
2. Start all defined services (web, api, qdrant, n8n) in detached mode.

### Health Check Verification

Once the services are up, you can verify their health:

- **API Health:**
  ```bash
  curl http://localhost:3000/healthz
  ```
  Expected output: `{"status":"ok"}`

- **Web Application:** Open your browser and navigate to `http://localhost:3001`. You should see the frontend application.

- **Qdrant Admin UI:** Open your browser and navigate to `http://localhost:6334`. You should see the Qdrant web UI.

- **n8n UI:** Open your browser and navigate to `http://localhost:5678`. You should see the n8n interface.

### Sample Usage Examples

After ensuring all services are up and healthy:

1.  **Ingest a document**: Use the `/ingest/normalize` API to add data to Qdrant. An example payload and cURL command are provided in the [API Reference](#post-ingestnormalize) section.

    ```bash
    # Example: Ingest a document
    curl -X POST http://localhost:3000/ingest/normalize \
      -H "Content-Type: application/json" \
      -d '{
            "documents": [
              {
                "content": "This is a sample document about the project architecture.",
                "metadata": {
                  "tenantId": "sample-tenant-001",
                  "docId": "project-arch-001",
                  "acl": ["public"],
                  "lang": "en",
                  "url": "http://example.com/docs/project-arch"
                }
              }
            ]
          }'
    ```

2.  **Ask a query**: Use the `/ask` API to retrieve information based on a natural language query. An example payload and cURL command are provided in the [API Reference](#post-ask) section.

    ```bash
    # Example: Ask a query
    curl -X POST http://localhost:3000/ask \
      -H "Content-Type: application/json" \
      -d '{
            "query": "What is the architecture of the project?",
            "userContext": {
              "id": "testuser",
              "groupIds": ["public"],
              "tenantId": "sample-tenant-001"
            },
            "k": 1
          }'
    ```

## 4. Environment Variables

Environment variables are managed via `.env.example` files at the root and within each application (if applicable). Copy `.env.example` to `.env` and adjust as needed.

- **Root `.env.example`**:
  - `QDRANT_HOST=qdrant`
  - `QDRANT_PORT=6333`
  - `QDRANT_GRPC_PORT=6334`
  - `N8N_WEBHOOK_URL=http://n8n:5678/webhook/ingest`
  - `N8N_HOST=n8n`
  - `N8N_PORT=5678`


- **`apps/api/.env.example`**:
  - `API_PORT=3000`
  - `NODE_ENV=development`
  - `QDRANT_HOST=qdrant` (or `localhost` for local dev outside Docker compose)
  - `QDRANT_PORT=6333`
  - `N8N_WEBHOOK_URL=http://n8n:5678/webhook/ingest` (or appropriate URL for local dev)

## 5. API Reference

The API is built with Fastify and exposed on port `3000`. All endpoints described here are accessible via `http://localhost:3000/{endpoint}`.

### Authentication and RBAC (Role-Based Access Control)

(Details on authentication and RBAC will be added here if implemented. Currently, there's no explicit authentication in the provided project structure.)

### Endpoints


Here are the details for the main API endpoints:

#### `GET /healthz`
- **Description**: Checks the health of the API service.
- **Request**: No parameters.
- **Response**:
  ```json
  {
    "status": "ok"
  }
  ```
- **Sample cURL**:
  ```bash
  curl -X GET http://localhost:3000/healthz
  ```

#### `GET /readyz`
- **Description**: Checks if the API is ready to serve traffic, including connectivity to Qdrant and the existence of the configured collection.
- **Request**: No parameters.
- **Response (Ready)**:
  ```json
  {
    "status": "ok",
    "qdrant": "connected"
  }
  ```
- **Response (Not Ready)**:
  ```json
  {
    "status": "not ready",
    "qdrant": "collection not found or not bootstrapped"
  }
  ```
  or
  ```json
  {
    "status": "not ready",
    "qdrant": "not connected",
    "error": "Qdrant connection refused"
  }
  ```
- **Sample cURL**:
  ```bash
  curl -X GET http://localhost:3000/readyz
  ```

#### `POST /ask`
- **Description**: Submits a natural language query to the RAG system and retrieves a generated answer along with relevant documents. This endpoint incorporates Role-Based Access Control (RBAC) to filter documents based on the `userContext`.
- **Request Body**: [`AskRequest`](packages/shared/src/schemas/index.ts:49)
  ```json
  {
    "query": "What are the benefits of vector databases?",
    "userContext": {
      "id": "user123",
      "groupIds": ["groupA", "groupB"],
      "tenantId": "tenant-uuid-123"
    },
    "k": 5,           // Optional: Number of top documents to retrieve
    "filter": {       // Optional: Additional Qdrant filters
      "lang": "en"
    }
  }
  ```
- **Response Body**: [`AskResponse`](packages/shared/src/schemas/index.ts:56)
  ```json
  {
    "answer": "Phase-0 stub answer: This is a placeholder response based on your query.",
    "retrievedDocuments": [
      {
        "document": {
          "id": "doc1",
          "content": "Vector databases excel at semantic search...",
          "metadata": {
            "tenantId": "tenant-uuid-123",
            "docId": "doc-a1",
            "acl": ["user123", "groupA"],
            "lang": "en",
            "url": "http://example.com/doc1"
          }
        },
        "score": 0.98
      }
    ],
    "queryId": "qid-1678886400000"
  }
  ```
- **Sample cURL**:
  ```bash
  curl -X POST http://localhost:3000/ask \
    -H "Content-Type: application/json" \
    -d '{
          "query": "What are the benefits of vector databases?",
          "userContext": {
            "id": "user123",
            "groupIds": ["groupA"],
            "tenantId": "tenant-uuid-123"
          },
          "k": 3
        }'
  ```

#### `POST /ingest/normalize`
- **Description**: Ingests new documents into the Qdrant vector database after normalization (not implemented yet, but assumed).
- **Request Body**: [`IngestDocumentRequest`](packages/shared/src/schemas/index.ts:22)
  ```json
  {
    "documents": [
      {
        "content": "This is the content of document one.",
        "metadata": {
          "tenantId": "tenant-uuid-124",
          "docId": "doc-b2",
          "acl": ["user456", "groupC"],
          "lang": "en",
          "url": "http://example.com/doc-b2"
        }
      },
      {
        "content": "The second document's important information.",
        "metadata": {
          "tenantId": "tenant-uuid-124",
          "docId": "doc-b3",
          "acl": ["user456"],
          "lang": "en",
          "authors": ["Jane Doe"],
          "filepath": "/docs/project/file.md"
        }
      }
    ]
  }
  ```
- **Response Body**: IngestDocumentResponse
  ```json
  {
    "success": true,
    "documentIds": ["auto-generated-id-1", "auto-generated-id-2"]
  }
  ```
  or (with failures):
  ```json
  {
    "success": false,
    "documentIds": ["auto-generated-id-1"],
    "failedDocuments": [
      {
        "document": {
          "content": "The second document's important information.",
          "metadata": {
            "tenantId": "tenant-uuid-124",
            "docId": "doc-b3",
            "acl": ["user456"],
            "lang": "en",
            "authors": ["Jane Doe"],
            "filepath": "/docs/project/file.md"
          }
        },
        "error": "Failed to connect to Qdrant"
      }
    ]
  }
  ```
- **Sample cURL**:
  ```bash
  curl -X POST http://localhost:3000/ingest/normalize \
    -H "Content-Type: application/json" \
    -d '{
          "documents": [
            {
              "content": "This is a new document about software engineering.",
              "metadata": {
                "tenantId": "tenant-uuid-456",
                "docId": "new-doc-1",
                "acl": ["admin", "devs"],
                "lang": "en",
                "url": "http://example.com/new-doc-1"
              }
            }
          ]
        }'
  ```

## 6. Development Guide

This guide provides instructions for developers to work on the project, including how to add new endpoints, modify shared types, and run tests.

### How to Add New Endpoints (API)

1.  **Create a new route file**: In `apps/api/src/routes/`, create a new TypeScript file (e.g., `myNewEndpoint.ts`).
2.  **Define the route**: Export a Fastify plugin that defines your new endpoint.
    ```typescript
    // apps/api/src/routes/myNewEndpoint.ts
    import { FastifyInstance, FastifyPluginOptions } from 'fastify';

    export default async function myNewEndpointRoutes(
      fastify: FastifyInstance,
      opts: FastifyPluginOptions
    ) {
      fastify.get('/my-new-endpoint', async (request, reply) => {
        return { message: 'Hello from new endpoint!' };
      });

      fastify.post<{ Body: { data: string } }>(
        '/my-new-endpoint',
        async (request, reply) => {
          const { data } = request.body;
          return { received: data, status: 'processed' };
        }
      );
    }
    ```
3.  **Register the route in `server.ts`**: Open [`apps/api/src/server.ts`](apps/api/src/server.ts:25) and import and register your new route plugin.
    ```typescript
    // apps/api/src/server.ts
    // ... other imports
    import myNewEndpointRoutes from './routes/myNewEndpoint'; // Add this line

    async function buildServer() {
      const server = fastify({
        logger: {
          level: process.env.LOG_LEVEL || 'info',
        },
      });

      // ... existing route registrations

      server.register(myNewEndpointRoutes); // Add this line

      return server;
    }
    ```
4.  **Restart the API service**: If running via Docker Compose, `docker-compose restart api` or `docker-compose up --build -d` from `ops/compose`. If running locally, restart your Node.js process.

### How to Modify Shared Types

Shared types are located in the `packages/shared/src/types/` directory.

1.  **Locate the type definition**: Find the relevant TypeScript file within `packages/shared/src/types/` (e.g., [`packages/shared/src/types/api.ts`](packages/shared/src/types/api.ts)).
2.  **Modify the type**: Update the interface or type definition as required.
    ```typescript
    // packages/shared/src/types/api.ts
    export interface AskRequest {
      query: string;
      sessionId?: string;
      newField?: string; // Added new field
    }
    ```
3.  **Rebuild shared package**: Navigate to the `packages/shared` directory and run `pnpm install` then `pnpm build`.
    ```bash
    cd packages/shared
    pnpm install
    pnpm build
    ```
4.  **Update dependent services**: Any service consuming this shared package (e.g., `apps/api`, `apps/web`) will automatically pick up the new types on their next build or restart. You might need to re-run `pnpm install` in those service directories if types are not reflecting correctly.

### Testing Guidelines

To run tests for the `api` service:
1. Navigate to the `apps/api` directory:
   ```bash
   cd apps/api
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run tests with Jest:
   ```bash
   pnpm test
   ```

At the moment, the `web` application does not have dedicated tests configured in the provided project structure.

### Docker Development Workflow

When developing, it's often useful to run individual services outside of the full Docker Compose stack or to rebuild specific images.

-   **Rebuild a specific service image**:
    ```bash
    cd ops/compose
    docker-compose build api # or web, qdrant, n8n
    ```
-   **Run a service locally (e.g., API)**:
    If you want to run the API service directly on your host machine for easier debugging:
    1. Ensure Qdrant and n8n are running via Docker Compose (`docker-compose up -d qdrant n8n`).
    2. Update `apps/api/.env` to point to `localhost` for Qdrant and n8n if necessary (e.g., `QDRANT_HOST=localhost`).
    3. Navigate to `apps/api`:
       ```bash
       cd apps/api
       ```
    4. Install dependencies:
       ```bash
       pnpm install
       ```
    5. Start the API:
       ```bash
       pnpm start # or pnpm dev for development mode with hot-reloading if configured
       ```
    The web application can then communicate with this locally running API if its `NEXT_PUBLIC_API_URL` (or similar) environment variable is set to `http://localhost:3000`.

## 7. Docker Services

The project uses Docker Compose to manage its services. The main configuration can be found at [`ops/compose/docker-compose.yml`](ops/compose/docker-compose.yml:1).

### Port Mappings and Service URLs

| Service   | Internal Container Port | External Host Port | URL (Local)            |
| :-------- | :---------------------- | :----------------- | :--------------------- |
| `web`     | `3001`                  | `3001`             | `http://localhost:3001`|
| `api`     | `3000`                  | `3000`             | `http://localhost:3000`|
| `qdrant`  | `6333` (gRPC)           | `6333`             | `grpc://localhost:6333`|
|           | `6334` (HTTP/UI)        | `6334`             | `http://localhost:6334`|
| `n8n`     | `5678`                  | `5678`             | `http://localhost:5678`|

### How to Reset Qdrant Data

To wipe all data stored in Qdrant, you can remove the Docker volume associated with it.

1.  **Stop services**:
    ```bash
    cd ops/compose
    docker-compose down
    ```
2.  **Remove Qdrant volume**:
    ```bash
    docker volume rm ops-compose_qdrant_data
    ```
    (The volume name might vary slightly based on your Docker Compose project name, typically `[project_name]_qdrant_data`. You can check available volumes with `docker volume ls`.)
3.  **Start services again**:
    ```bash
    docker-compose up --build -d
    ```
    Qdrant will start with an empty database.

## 8. n8n Workflows

n8n is used for orchestrating data ingestion and other backend workflows.

### How to Import and Run n8n Workflows

1.  **Access n8n UI**: Once n8n is running (part of the `docker-compose up` command), open your browser to `http://localhost:5678`.
2.  **Import workflow**:
    -   In the n8n UI, click "Workflows" in the left sidebar.
    -   Click "New" or the '+' icon, then select "Import from File".
    -   Browse to `n8n/workflows/ingest-baseline.json` and upload it.
3.  **Activate workflow**: After importing, the workflow will appear in your list. Ensure it's active by toggling the "Active" switch in the top right corner of the workflow editor.
4.  **Test workflow**: You can manually trigger the workflow from the n8n UI or by sending a POST request to its webhook URL if configured. The webhook URL for the `ingest-baseline` workflow would typically be `http://localhost:5678/webhook-test/ingest` during development and `http://localhost:5678/webhook/ingest` in production, assuming standard n8n setup and the workflow responding to `/webhook/ingest`. Update `N8N_WEBHOOK_URL` in your `.env` files accordingly.

## 9. Troubleshooting

This section provides solutions to common issues you might encounter during development or operation.

### General Issues

-   **Services not starting or unexpectedly stopping**:
    -   Check Docker logs for individual services: `docker-compose logs <service_name>` (e.g., `docker-compose logs api`).
    -   Ensure no other applications are using the required ports (3000, 3001, 5678, 6333, 6334) on your host machine.
    -   Try running `docker-compose down --volumes` followed by `docker-compose up --build -d` to perform a clean rebuild and restart.

-   **`pnpm` commands failing**:
    -   Ensure you have pnpm installed (`npm install -g pnpm`).
    -   Run `pnpm install` in the root of the project to install all workspace dependencies. If a specific package's `pnpm install` fails, try it within that package's directory (e.g., `cd apps/api && pnpm install`).

### Qdrant Issues

-   **Qdrant connection errors in API**:
    -   Verify Qdrant Docker container is running: `docker-compose ps`.
    -   Check Qdrant logs: `docker-compose logs qdrant`.
    -   Ensure `QDRANT_HOST` and `QDRANT_PORT` in `apps/api/.env` (or root `.env`) are correctly configured to point to the Qdrant service.
    -   If running API locally, `QDRANT_HOST` should typically be `localhost`. If running API via Docker Compose, `QDRANT_HOST` should be `qdrant`.

-   **Qdrant collection not found or uninitialized**:
    -   Check the API's `/readyz` endpoint. If it reports "collection not found", it means the Qdrant collection for storing vector data has not been created or bootstrapped. Current project setup expects the collection to be created before ingestion.
    -   You may need to manually create the collection through the Qdrant UI (`http://localhost:6334`) or by ensuring an ingestion process (e.g., via n8n workflow or a dedicated script) runs that creates it.

### n8n Issues

-   **n8n workflows not triggering or processing data**:
    -   Verify n8n Docker container is running and accessible at `http://localhost:5678`.
    -   Ensure the workflow is "Active" in the n8n UI.
    -   Check the workflow execution history within n8n UI for errors or unexpected behavior.
    -   If using webhooks, ensure the `N8N_WEBHOOK_URL` in your API's `.env` (or root `.env`) correctly points to the n8n webhook URL. Remember that in a Docker Compose setup, `n8n` is the hostname for inter-service communication.

## 10. Contributing

(Guidelines for contributing to the project will be added here.)
