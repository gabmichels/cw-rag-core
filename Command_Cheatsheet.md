# CLI Command Cheatsheet

This document provides a quick reference for common CLI commands to build, start, and manage the application's services, both locally and with Docker.

## 1. General Docker Compose Commands

These commands apply to any `docker-compose.yml` file. By default, `docker compose` will use `docker-compose.yml` in the current directory. To specify a different compose file (e.g., `docker-compose.eval.yml`), use the `-f` flag: `docker compose -f docker-compose.eval.yml <command>`.

*   **Build images (from Dockerfiles):**
    ```bash
    docker compose build
    ```
    *   **When to apply:** Run this when `Dockerfile`s or `package.json` dependencies (for services with `build` instructions) have changed. This rebuilds the images for all services defined in the `docker-compose.yml` file.

*   **Start services:**
    ```bash
    docker compose up
    ```
    *   Starts all services defined in the compose file in the foreground. This is useful for seeing logs directly.

    ```bash
    docker compose up -d
    ```
    *   Starts all services in detached mode (background). Use this for continuous operation.

    ```bash
    docker compose up --build -d
    ```
    *   Builds images (if changes are detected or not built yet) and then starts services in detached mode. This is a common command for fresh starts or applying code changes that don't involve `Dockerfile` modifications. If Dockerfiles have changed, it's safer to run `docker compose build` explicitly first.

*   **Stop services:**
    ```bash
    docker compose stop
    ```
    *   Stops running services without removing their containers. They can be restarted with `docker compose start`.

    ```bash
    docker compose down
    ```
    *   Stops and removes containers, networks, and volumes defined in the compose file.
    *   **When to apply:** Use this when you want a clean slate (e.g., after significant configuration changes, or to reclaim resources).

    ```bash
    docker compose down --volumes
    ```
    *   Stops and removes containers, networks, and *named volumes*. Be careful as this will delete data stored in volumes (e.g., Qdrant data).
    *   **When to apply:** Only use this if you explicitly want to clear persistent data (e.g., during development or for a complete reset).

*   **List running services:**
    ```bash
    docker compose ps
    ```
    *   Shows the status of all services.

*   **View service logs:**
    ```bash
    docker compose logs -f <service_name>
    ```
    *   Follows the logs for a specific service (e.g., `api`, `web`). Omit `<service_name>` to see logs from all services.

## 2. Main Application Services (Development/Production)

These commands use the primary [`docker-compose.yml`](docker-compose.yml) for the main application (API, Web, Qdrant, Embeddings).

*   **Start the full application stack:**
    ```bash
    docker compose up --build -d
    ```
    *   Builds container images (if necessary) and runs `api`, `web`, `qdrant`, and `embeddings` in the background.

*   **Rebuild and restart a specific service (e.g., `api`):**
    ```bash
    docker compose build api
    docker compose up -d api
    ```
    *   Use this if only the API's `Dockerfile` or source code has changed.

## 3. Evaluation Services

These commands use [`docker-compose.eval.yml`](docker-compose.eval.yml) for running evaluation, seeding data, or monitoring.

*   **Start evaluation environment (API, Qdrant, Embeddings, Evaluator):**
    ```bash
    docker compose -f docker-compose.eval.yml up --build -d --profile evaluation
    ```
    *   Starts the core evaluation services and the `evaluator` container.

*   **Run data seeder:**
    ```bash
    docker compose -f docker-compose.eval.yml up --build -d --profile seed
    ```
    *   Starts the `seeder` container to populate data for evaluations.

*   **Run monitoring (Prometheus, Grafana):**
    ```bash
    docker compose -f docker-compose.eval.yml up --build -d --profile monitoring
    ```
    *   Starts Prometheus and Grafana for observing the evaluation environment.

*   **Stop evaluation services:**
    ```bash
    docker compose -f docker-compose.eval.yml down --volumes
    ```
    *   Stops and removes all containers, networks, and named volumes associated with the evaluation environment, ensuring a clean state for subsequent runs.

## 4. Local API Server Startup (without Docker)

If you need to run the API service locally without Docker (e.g., for faster development cycles or debugging with local tools), use this command from the project root:

```bash
run_api.bat
```
*   **Prerequisites:** You must have Node.js and pnpm installed, and the API dependencies installed (`pnpm install` in `apps/api`).
*   **Note:** This will expect Qdrant and Embeddings services to be running and accessible at `http://localhost:6333` and `http://localhost:8080` respectively. You might need to start these services using `docker compose up -d qdrant embeddings` from the main `docker-compose.yml` if you intend to run the API locally this way.