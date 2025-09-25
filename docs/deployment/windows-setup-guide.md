# Windows Setup Guide for Firebase Deployment

## Required Tools Installation

### 1. Install Terraform

**Option A: Using Chocolatey (Recommended)**
```powershell
# Install Chocolatey first if you don't have it
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Terraform
choco install terraform
```

**Option B: Manual Installation**
1. Download Terraform from: https://developer.hashicorp.com/terraform/downloads
2. Extract the `terraform.exe` to a folder (e.g., `C:\terraform`)
3. Add the folder to your PATH environment variable

**Option C: Using winget**
```powershell
winget install Hashicorp.Terraform
```

### 2. Install Google Cloud CLI

**Download and install from:**
https://cloud.google.com/sdk/docs/install-sdk#windows

**Or using Chocolatey:**
```powershell
choco install gcloudsdk
```

### 3. Install Firebase CLI

```powershell
npm install -g firebase-tools
```

### 4. Verify Docker is Installed

```powershell
docker --version
```

If not installed, download from: https://docs.docker.com/desktop/install/windows-install/

### 5. Verify Tools Installation

```powershell
terraform --version
gcloud --version
firebase --version
docker --version
pnpm --version
```

## Authentication Setup

### 1. Authenticate with Google Cloud

```powershell
gcloud auth login
gcloud auth application-default login
```

### 2. Set Default Project (Optional)

```powershell
gcloud config set project YOUR_PROJECT_ID
```

## Ready to Deploy!

Once all tools are installed and authenticated, run:

```powershell
bash scripts/deploy-zenithfall-firebase.sh 013ACE-D30E65-D19FE2
```

## Alternative: Manual Terraform Deployment

If you prefer to run Terraform manually:

```powershell
cd infrastructure/terraform/zenithfall

# Initialize Terraform
terraform init

# Create variables file
$billingAccount = "013ACE-D30E65-D19FE2"
@"
billing_account = "$billingAccount"
region = "europe-west3"
firebase_location = "eur3"
tier = "development"
"@ | Out-File -FilePath terraform.tfvars

# Plan and apply
terraform plan -out=zenithfall.tfplan
terraform apply zenithfall.tfplan

# Get outputs
terraform output