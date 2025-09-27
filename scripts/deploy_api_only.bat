@echo off
setlocal

:: Configuration
set PROJECT_ID=rag-zenithfall-827ad2
set REGION=europe-west3
set REGISTRY=europe-west3-docker.pkg.dev
set TENANT=zenithfall
set API_SERVICE=rag-api
set QDRANT_SERVICE=qdrant
set EMBEDDINGS_SERVICE=embeddings

echo Getting Qdrant URL...
for /f "tokens=*" %%i in ('gcloud run services describe %QDRANT_SERVICE% --region=%REGION% --format="value(status.url)"') do set QDRANT_URL=%%i
if not defined QDRANT_URL (
    echo ERROR: Could not retrieve QDRANT_URL. Exiting.
    exit /b 1
)
echo Qdrant URL: %QDRANT_URL%

echo Getting Embeddings URL...
for /f "tokens=*" %%i in ('gcloud run services describe %EMBEDDINGS_SERVICE% --region=%REGION% --format="value(status.url)"') do set EMBEDDINGS_URL=%%i
if not defined EMBEDDINGS_URL (
    echo ERROR: Could not retrieve EMBEDDINGS_URL. Exiting.
    exit /b 1
)
echo Embeddings URL: %EMBEDDINGS_URL%

:: Step 3: Build and Push API Container
echo Building API container...
cd ..
docker build -t %REGISTRY%/%PROJECT_ID%/rag-containers/%API_SERVICE%:latest -f apps/api/Dockerfile .
cd scripts
if %errorlevel% neq 0 (
    echo ERROR: API container build failed.
    exit /b 1
)

echo Pushing API container...
docker push %REGISTRY%/%PROJECT_ID%/rag-containers/%API_SERVICE%:latest
if %errorlevel% neq 0 (
    echo ERROR: API container push failed.
    exit /b 1
)

:: Step 7: Deploy API Service
echo Deploying API Service
gcloud run deploy %API_SERVICE% ^
  --image="%REGISTRY%/%PROJECT_ID%/rag-containers/%API_SERVICE%:latest" ^
  --region=%REGION% ^
  --platform=managed ^
  --allow-unauthenticated ^
  --port=3000 ^
  --memory=4Gi ^
  --cpu=2 ^
  --max-instances=10 ^
  --timeout=900 ^
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,QDRANT_URL=%QDRANT_URL%,QDRANT_COLLECTION=docs_v1,CORS_ORIGIN=https://rag-%TENANT%-827ad2.web.app,TENANT=%TENANT%,VECTOR_DIM=384,PII_POLICY=strict,EMBEDDINGS_PROVIDER=huggingface,EMBEDDINGS_MODEL=BAAI/bge-small-en-v1.5,EMBEDDINGS_URL=%EMBEDDINGS_URL%,LLM_ENABLED=true,LLM_PROVIDER=openai,LLM_MODEL=gpt-4-1106-preview,LLM_STREAMING=true,LLM_TIMEOUT_MS=25000,ANSWERABILITY_THRESHOLD=0.01,VECTOR_SEARCH_TIMEOUT_MS=8000,KEYWORD_SEARCH_TIMEOUT_MS=5000,RERANKER_TIMEOUT_MS=15000,OVERALL_TIMEOUT_MS=60000,EMBEDDING_TIMEOUT_MS=8000,RATE_LIMIT_PER_IP=100,RATE_LIMIT_PER_USER=1000,RATE_LIMIT_PER_TENANT=10000,RATE_LIMIT_WINDOW_MINUTES=1,RETRIEVAL_K_BASE=25,MMR_ENABLED=off,MMR_ALPHA=0.5,RERANK_TOPK=12,RERANKER=crossencoder,FUSION_STRATEGY=weighted_average,FUSION_NORMALIZATION=none,FUSION_K_PARAM=1,FUSION_DEBUG_TRACE=on,RETRIEVAL_TRACE=1,HYBRID_VECTOR_WEIGHT=0.7,HYBRID_KEYWORD_WEIGHT=0.3,QUERY_ADAPTIVE_WEIGHTS=on,KW_POINTS_ENABLED=on,KW_LAMBDA=0.25,KW_IDF_GAMMA=0.35,KW_RANK_DECAY=0.85,KW_FIELD_WEIGHTS=body:3,title:2.2,header:1.8,section:1.3,docId:1.1,KW_BODY_SAT_C=0.6,KW_EARLY_POS_TOKENS=250,KW_EARLY_POS_NUDGE=1.08,KW_PROX_WIN=30,KW_PROXIMITY_BETA=0.25,KW_COVERAGE_ALPHA=0.25,KW_EXCLUSIVITY_GAMMA=0.25,KW_CLAMP_KW_NORM=2.0,KW_TOPK_COVERAGE=2,KW_SOFTAND_STRICT=on,KW_SOFTAND_OVERRIDE_PCTL=95,CONTEXT_TOKEN_BUDGET=8000,TOKENIZER_MODEL=gpt-4o-2024-11-20,PACKING_PER_DOC_CAP=2,PACKING_PER_SECTION_CAP=1,PACKING_NOVELTY_ALPHA=0.5,PACKING_ANSWERABILITY_BONUS=0.1,SECTION_REUNIFICATION=on,FEATURES_ENABLED=on,DOMAINLESS_RANKING_ENABLED=on,KEYPHRASE_TOP_N=3,ALIAS_EMB_SIM_TAU=0.83,ALIAS_PMI_SIM_TAU=0.30,COVERAGE_ALPHA=0.30,PROXIMITY_BETA=0.20,FIELD_BOOST_DELTA=0.12,EXCLUSIVITY_GAMMA=0.25,PROXIMITY_WINDOW=40" ^
  --set-secrets="OPENAI_API_KEY=zenithfall-openai-api-key:latest,INGEST_TOKEN=zenithfall-ingest-token:latest"
if %errorlevel% neq 0 (
    echo ERROR: API deployment failed.
    exit /b 1
)

echo API deployment completed successfully.

:: Get final API URL for confirmation
for /f "tokens=*" %%i in ('gcloud run services describe %API_SERVICE% --region=%REGION% --format="value(status.url)"') do set FINAL_API_URL=%%i
echo Final API URL: %FINAL_API_URL%

endlocal
exit /b 0