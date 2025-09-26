@echo off
setlocal

:: Configuration
set PROJECT_ID=rag-zenithfall-827ad2
set REGION=europe-west3
set REGISTRY=europe-west3-docker.pkg.dev
set TENANT=zenithfall
set API_SERVICE=rag-api
set WEB_SERVICE=rag-web

echo Getting API URL...
for /f "tokens=*" %%i in ('gcloud run services describe %API_SERVICE% --region=%REGION% --format="value(status.url)"') do set API_URL=%%i
if not defined API_URL (
    echo ERROR: Could not retrieve API_URL. Exiting.
    exit /b 1
)
echo API URL: %API_URL%

:: Step 4: Build and Push Web Container
echo Building web container...
cd ..
docker build -t %REGISTRY%/%PROJECT_ID%/rag-containers/%WEB_SERVICE%:latest -f apps/web/Dockerfile .
cd scripts
if %errorlevel% neq 0 (
    echo ERROR: Web container build failed.
    exit /b 1
)

echo Pushing web container...
docker push %REGISTRY%/%PROJECT_ID%/rag-containers/%WEB_SERVICE%:latest
if %errorlevel% neq 0 (
    echo ERROR: Web container push failed.
    exit /b 1
)

:: Step 8: Deploy Web Service
echo Deploying Web Service
gcloud run deploy %WEB_SERVICE% ^
  --image="%REGISTRY%/%PROJECT_ID%/rag-containers/%WEB_SERVICE%:latest" ^
  --region=%REGION% ^
  --platform=managed ^
  --allow-unauthenticated ^
  --port=3000 ^
  --memory=2Gi ^
  --cpu=1 ^
  --max-instances=10 ^
  --set-env-vars="API_URL=%API_URL%,NEXT_PUBLIC_API_URL=%API_URL%,API_BASE_URL=%API_URL%,TENANT=%TENANT%,HOSTNAME=0.0.0.0,NEXT_TELEMETRY_DISABLED=1,NEXT_PUBLIC_TENANT_BRAND_NAME=Zenithfall RAG,NEXT_PUBLIC_TENANT_LOGO_URL=/logos/zenithfall-logo.png,NEXT_PUBLIC_TENANT_PRIMARY_COLOR=#059669,NEXT_PUBLIC_TENANT_SECONDARY_COLOR=#10b981,NEXT_PUBLIC_TENANT_THEME=production"
if %errorlevel% neq 0 (
    echo ERROR: Web deployment failed.
    exit /b 1
)

echo Web deployment completed successfully.

endlocal
exit /b 0