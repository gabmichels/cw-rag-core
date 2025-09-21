# n8n Document Ingestion Baseline Workflow

This workflow demonstrates how to ingest documents into the RAG system using n8n. It provides a manual trigger, an HTTP Request node to call the `/ingest/normalize` API endpoint, and comprehensive error and success handling.

## Workflow Functionality

-   **Manual Trigger**: Initiates the workflow execution manually.
-   **Ingest Document (HTTP Request)**: Sends a POST request to the `/ingest/normalize` endpoint with a sample document payload.
    -   Uses an environment variable `API_URL` for flexible API endpoint configuration.
    -   Configured to continue on fail to allow for error handling.
-   **Check Response Status (IF node)**: Evaluates the HTTP response status code.
    -   If the status code is `2xx` (success), it proceeds to the `Success Handler`.
    -   Otherwise, it proceeds to the `Error Handler`.
-   **Success Handler (NoOp node)**: Logs the successful ingestion response.
-   **Error Handler (NoOp node)**: Catches and logs any errors that occur during the HTTP request or if the API returns a non-2xx status code.

## Workflow File

-   `ingest-baseline.json`

## Configuration

To use this workflow, you need to configure the `API_URL` environment variable in your n8n instance.

**Environment Variable:**

-   **`API_URL`**: The base URL of your ingestion API.
    -   **For local Docker setup**: `http://api:3000` (assuming your API service is named `api` in your Docker Compose file).
    -   **Example (in `.env` file for n8n container or within n8n UI)**: `API_URL=http://api:3000`

## How to Import and Use

1.  **Start n8n**: Ensure your n8n instance is running (e.g., via Docker).
2.  **Import Workflow**:
    *   In the n8n UI, click "Workflows" on the left sidebar.
    *   Click "New" -> "Import from JSON".
    *   Copy the content of `n8n/workflows/ingest-baseline.json` and paste it into the import dialog.
    *   Click "Import".
3.  **Configure Environment Variable**:
    *   Go to "Settings" -> "Environment Variables" in n8n.
    *   Add a new environment variable:
        *   `Key`: `API_URL`
        *   `Value`: `http://api:3000` (or your API's base URL)
    *   Save the environment variable.
4.  **Activate Workflow**:
    *   Open the imported workflow.
    *   Flip the "Active" toggle in the top right corner to `On`.
5.  **Execute Workflow**:
    *   Click "Execute Workflow" -> "Manual Trigger" in the top right corner.
    *   Alternatively, click on the "Manual Trigger" node and then "Execute Node".
6.  **Verify Results**:
    *   Check the output of the "Success Handler" or "Error Handler" nodes to see the ingestion status and response.