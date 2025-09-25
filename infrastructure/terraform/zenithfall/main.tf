/**
 * Terraform configuration for deploying Zenithfall tenant to Firebase/GCP
 * This uses the firebase-tenant module with Zenithfall-specific settings
 */

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Variables - these can be overridden via terraform.tfvars or command line
variable "billing_account" {
  description = "GCP billing account ID"
  type        = string
  # You'll set this in terraform.tfvars or via command line
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "europe-west3" # Frankfurt, Germany
}

variable "firebase_location" {
  description = "Firebase/Firestore location"
  type        = string
  default     = "eur3" # Europe multi-region
}

variable "tier" {
  description = "Tenant tier for Zenithfall"
  type        = string
  default     = "development" # Start with development, upgrade later
}

# Configure the Google Provider
provider "google" {
  region = var.region
}

provider "google-beta" {
  region = var.region
}

# Deploy Zenithfall using the firebase-tenant module
module "zenithfall" {
  source = "../modules/firebase-tenant"

  # Tenant configuration
  tenant_id   = "zenithfall"
  tenant_name = "Zenithfall RAG"
  tier        = var.tier

  # Infrastructure configuration
  region           = var.region
  firebase_location = var.firebase_location
  billing_account  = var.billing_account

  # Enable additional APIs for development
  enable_apis = [
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "run.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iamcredentials.googleapis.com"
  ]
}

# Create additional resources specific to Zenithfall
resource "google_storage_bucket" "zenithfall_uploads" {
  name     = "${module.zenithfall.project_id}-uploads"
  location = var.region
  project  = module.zenithfall.project_id

  storage_class = "STANDARD"

  versioning {
    enabled = false # Not needed for temporary uploads
  }

  lifecycle_rule {
    condition {
      age = 7 # Delete uploads after 7 days
    }
    action {
      type = "Delete"
    }
  }

  uniform_bucket_level_access = true

  cors {
    origin          = [
      "https://${module.zenithfall.project_id}.web.app",
      "https://${module.zenithfall.project_id}.firebaseapp.com",
      "http://localhost:3001" # For local development
    ]
    method          = ["GET", "POST", "PUT", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# Create a secret for OpenAI API key (Zenithfall uses OpenAI)
resource "google_secret_manager_secret" "openai_api_key" {
  project   = module.zenithfall.project_id
  secret_id = "openai-api-key"

  replication {
    auto {}
  }
}

# Store the OpenAI API key (you'll need to update this manually)
resource "google_secret_manager_secret_version" "openai_api_key_version" {
  secret = google_secret_manager_secret.openai_api_key.id

  # Placeholder - you'll need to update this with your actual API key
  secret_data = "your-openai-api-key-here"

  lifecycle {
    ignore_changes = [secret_data] # Don't overwrite manually updated values
  }
}

# Grant service account access to the OpenAI secret
resource "google_secret_manager_secret_iam_member" "openai_secret_access" {
  project   = module.zenithfall.project_id
  secret_id = google_secret_manager_secret.openai_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${module.zenithfall.service_account_email}"
}

# Create Firestore security rules
resource "google_firestore_database" "rules_update" {
  project     = module.zenithfall.project_id
  name        = "(default)"
  location_id = var.firebase_location
  type        = "FIRESTORE_NATIVE"

  # This will use the existing database created by the module
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [location_id, type] # Don't change existing database
  }
}

# Output important values for easy access
output "zenithfall_project_id" {
  description = "GCP Project ID for Zenithfall"
  value       = module.zenithfall.project_id
}

output "zenithfall_firebase_config" {
  description = "Firebase configuration for Zenithfall web app"
  value       = module.zenithfall.firebase_config
}

output "zenithfall_api_url" {
  description = "Cloud Run API URL for Zenithfall"
  value       = module.zenithfall.api_url
}

output "zenithfall_web_url" {
  description = "Firebase Hosting URL for Zenithfall"
  value       = "https://${module.zenithfall.project_id}.web.app"
}

output "zenithfall_storage_bucket" {
  description = "Main storage bucket for Zenithfall documents"
  value       = module.zenithfall.storage_bucket
}

output "zenithfall_uploads_bucket" {
  description = "Upload storage bucket for Zenithfall"
  value       = google_storage_bucket.zenithfall_uploads.name
}

output "zenithfall_container_registry" {
  description = "Container registry for Zenithfall images"
  value       = module.zenithfall.container_registry
}

output "deployment_commands" {
  description = "Commands to complete the deployment"
  value = {
    firebase_login = "firebase login"
    firebase_use_project = "firebase use ${module.zenithfall.project_id}"
    update_openai_key = "gcloud secrets versions add openai-api-key --data-file=- --project=${module.zenithfall.project_id}"
    build_and_deploy = "./scripts/deploy-zenithfall-firebase.sh ${module.zenithfall.project_id}"
  }
}

# Create local files for easier development
resource "local_file" "firebase_config" {
  filename = "${path.module}/../../../.env.zenithfall.firebase"
  content = templatefile("${path.module}/firebase-env.tpl", {
    project_id = module.zenithfall.project_id
    api_url    = module.zenithfall.api_url
    firebase_config = module.zenithfall.firebase_config
    storage_bucket = module.zenithfall.storage_bucket
    uploads_bucket = google_storage_bucket.zenithfall_uploads.name
    region = var.region
  })
}

resource "local_file" "deployment_info" {
  filename = "${path.module}/../../../zenithfall-deployment.json"
  content = jsonencode({
    tenant_id = "zenithfall"
    project_id = module.zenithfall.project_id
    region = var.region
    tier = var.tier
    urls = {
      api = module.zenithfall.api_url
      web = "https://${module.zenithfall.project_id}.web.app"
      console = "https://console.firebase.google.com/project/${module.zenithfall.project_id}"
    }
    firebase_config = module.zenithfall.firebase_config
    storage = {
      documents = module.zenithfall.storage_bucket
      uploads = google_storage_bucket.zenithfall_uploads.name
    }
    container_registry = module.zenithfall.container_registry
    deployment_date = timestamp()
  })
}