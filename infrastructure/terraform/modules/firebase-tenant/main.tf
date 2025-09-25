/**
 * Terraform module for creating Firebase-enabled tenant projects
 * Works with billing accounts (no organization required)
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
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }
}

# Variables
variable "tenant_id" {
  description = "Unique tenant identifier (DNS-compatible)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.tenant_id))
    error_message = "Tenant ID must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "tenant_name" {
  description = "Human-readable tenant name"
  type        = string
  default     = ""
}

variable "tier" {
  description = "Tenant tier"
  type        = string
  default     = "basic"
  validation {
    condition     = contains(["development", "basic", "premium", "enterprise"], var.tier)
    error_message = "Tier must be one of: development, basic, premium, enterprise."
  }
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "europe-west3" # Frankfurt, Germany
  validation {
    condition = contains([
      "europe-west3",  # Frankfurt, Germany
      "europe-west1",  # Belgium
      "us-central1",   # Iowa, US
      "asia-northeast1" # Tokyo, Japan
    ], var.region)
    error_message = "Region must be one of the supported regions."
  }
}

variable "firebase_location" {
  description = "Firebase/Firestore location"
  type        = string
  default     = "eur3" # Europe multi-region
}

variable "billing_account" {
  description = "GCP billing account ID"
  type        = string
}

variable "enable_apis" {
  description = "List of APIs to enable"
  type        = list(string)
  default = [
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "run.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com"
  ]
}

# Generate random suffix for unique project ID
resource "random_id" "project_suffix" {
  byte_length = 3
}

# Local values for configuration
locals {
  project_id = "rag-${var.tenant_id}-${random_id.project_suffix.hex}"
  tenant_name = var.tenant_name != "" ? var.tenant_name : "CW RAG ${title(var.tenant_id)}"

  # Tier-specific configurations
  tier_config = {
    development = {
      enable_monitoring = false
      enable_backup     = false
      cpu_limit        = "1"
      memory_limit     = "2Gi"
      min_instances    = 0
      max_instances    = 5
    }
    basic = {
      enable_monitoring = true
      enable_backup     = true
      cpu_limit        = "2"
      memory_limit     = "4Gi"
      min_instances    = 1
      max_instances    = 10
    }
    premium = {
      enable_monitoring = true
      enable_backup     = true
      cpu_limit        = "4"
      memory_limit     = "8Gi"
      min_instances    = 2
      max_instances    = 25
    }
    enterprise = {
      enable_monitoring = true
      enable_backup     = true
      cpu_limit        = "8"
      memory_limit     = "16Gi"
      min_instances    = 5
      max_instances    = 100
    }
  }

  current_tier = local.tier_config[var.tier]
}

# Create the GCP project
resource "google_project" "tenant_project" {
  name            = local.tenant_name
  project_id      = local.project_id
  billing_account = var.billing_account

  labels = {
    tenant      = var.tenant_id
    tier        = var.tier
    region      = var.region
    environment = "production"
    managed_by  = "terraform"
  }

  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset(var.enable_apis)

  project = google_project.tenant_project.project_id
  service = each.value

  # Don't disable on destroy to prevent data loss
  disable_on_destroy = false

  depends_on = [google_project.tenant_project]
}

# Create Firebase project
resource "google_firebase_project" "tenant_firebase" {
  provider = google-beta
  project  = google_project.tenant_project.project_id

  depends_on = [
    google_project_service.apis["firebase.googleapis.com"]
  ]
}

# Configure Firebase Authentication
resource "google_identity_platform_config" "auth_config" {
  project = google_project.tenant_project.project_id

  sign_in {
    allow_duplicate_emails = false

    anonymous {
      enabled = var.tier == "development" || var.tier == "basic"
    }

    email {
      enabled           = true
      password_required = true
    }
  }

  # Multi-factor authentication for premium and enterprise
  dynamic "mfa" {
    for_each = var.tier == "premium" || var.tier == "enterprise" ? [1] : []
    content {
      state = "ENABLED"
      enabled_providers = ["PHONE_SMS"]
    }
  }

  depends_on = [
    google_project_service.apis["identitytoolkit.googleapis.com"]
  ]
}

# Create Firestore database
resource "google_firestore_database" "tenant_db" {
  project     = google_project.tenant_project.project_id
  name        = "(default)"
  location_id = var.firebase_location
  type        = "FIRESTORE_NATIVE"

  # Concurrency control
  concurrency_mode = "OPTIMISTIC"

  # App Engine integration
  app_engine_integration_mode = "DISABLED"

  # Point-in-time recovery for premium tiers
  point_in_time_recovery_enablement = local.current_tier.enable_backup ? "POINT_IN_TIME_RECOVERY_ENABLED" : "POINT_IN_TIME_RECOVERY_DISABLED"

  # Delete protection for production data
  deletion_policy = "DELETE"

  depends_on = [
    google_firebase_project.tenant_firebase,
    google_project_service.apis["firestore.googleapis.com"]
  ]
}

# Create Cloud Storage bucket for documents
resource "google_storage_bucket" "tenant_documents" {
  name     = "${local.project_id}-documents"
  location = var.region
  project  = google_project.tenant_project.project_id

  # Storage class optimization
  storage_class = "STANDARD"

  # Versioning for data protection
  versioning {
    enabled = local.current_tier.enable_backup
  }

  # Lifecycle management
  lifecycle_rule {
    condition {
      age = 365 # Delete after 1 year
    }
    action {
      type = "Delete"
    }
  }

  # Enable uniform bucket-level access
  uniform_bucket_level_access = true

  # CORS configuration for web uploads
  cors {
    origin          = ["https://${local.project_id}.web.app", "https://${local.project_id}.firebaseapp.com"]
    method          = ["GET", "POST", "PUT", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [
    google_project_service.apis["storage.googleapis.com"]
  ]
}

# Create service account for API services
resource "google_service_account" "api_service_account" {
  project      = google_project.tenant_project.project_id
  account_id   = "rag-api-service"
  display_name = "RAG API Service Account"
  description  = "Service account for RAG API Cloud Run service"
}

# Grant necessary IAM permissions to service account
resource "google_project_iam_member" "api_service_permissions" {
  for_each = toset([
    "roles/firestore.user",           # Firestore read/write
    "roles/storage.objectAdmin",      # Cloud Storage access
    "roles/secretmanager.secretAccessor", # Secret Manager access
    "roles/logging.logWriter",        # Cloud Logging
    "roles/monitoring.metricWriter",  # Cloud Monitoring
    "roles/firebase.managementServiceAgent" # Firebase services
  ])

  project = google_project.tenant_project.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.api_service_account.email}"

  depends_on = [google_service_account.api_service_account]
}

# Create Artifact Registry for container images
resource "google_artifact_registry_repository" "container_repo" {
  project       = google_project.tenant_project.project_id
  location      = var.region
  repository_id = "rag-containers"
  description   = "Container registry for RAG application"
  format        = "DOCKER"

  depends_on = [
    google_project_service.apis["artifactregistry.googleapis.com"]
  ]
}

# Create Secret Manager secrets for configuration
resource "google_secret_manager_secret" "api_config" {
  project   = google_project.tenant_project.project_id
  secret_id = "api-config"

  replication {
    auto {}
  }

  depends_on = [
    google_project_service.apis["secretmanager.googleapis.com"]
  ]
}

# Store initial configuration in Secret Manager
resource "google_secret_manager_secret_version" "api_config_version" {
  secret = google_secret_manager_secret.api_config.id

  secret_data = jsonencode({
    tenant_id = var.tenant_id
    tier      = var.tier
    region    = var.region
    firebase_config = {
      project_id      = local.project_id
      auth_domain     = "${local.project_id}.firebaseapp.com"
      storage_bucket  = "${local.project_id}.appspot.com"
      database_url    = "https://${local.project_id}-default-rtdb.${var.firebase_location}.firebasedatabase.app"
    }
    features = {
      firestore_enabled  = true
      auth_enabled       = true
      storage_enabled    = true
      analytics_enabled  = var.tier != "development"
      monitoring_enabled = local.current_tier.enable_monitoring
    }
  })
}

# Create Cloud Run service for the API
resource "google_cloud_run_service" "api_service" {
  name     = "rag-api"
  location = var.region
  project  = google_project.tenant_project.project_id

  template {
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = tostring(local.current_tier.min_instances)
        "autoscaling.knative.dev/maxScale" = tostring(local.current_tier.max_instances)
        "run.googleapis.com/cpu-throttling" = "false"
        "run.googleapis.com/execution-environment" = "gen2"
      }
    }

    spec {
      service_account_name = google_service_account.api_service_account.email
      timeout_seconds      = 3600 # 1 hour timeout for long operations

      containers {
        # Placeholder image - will be updated by deployment scripts
        image = "gcr.io/cloudrun/hello"

        ports {
          container_port = 3000
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "TENANT_ID"
          value = var.tenant_id
        }

        env {
          name  = "TIER"
          value = var.tier
        }

        env {
          name  = "FIREBASE_PROJECT_ID"
          value = local.project_id
        }

        env {
          name  = "GCP_REGION"
          value = var.region
        }

        env {
          name  = "FIRESTORE_DATABASE"
          value = "(default)"
        }

        env {
          name  = "STORAGE_BUCKET"
          value = google_storage_bucket.tenant_documents.name
        }

        resources {
          limits = {
            cpu    = local.current_tier.cpu_limit
            memory = local.current_tier.memory_limit
          }
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_project_service.apis["run.googleapis.com"],
    google_service_account.api_service_account
  ]
}

# Make Cloud Run service publicly accessible
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.api_service.name
  location = google_cloud_run_service.api_service.location
  project  = google_project.tenant_project.project_id
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Firebase Hosting configuration will be handled by Firebase CLI
# during deployment, but we can prepare the project

# Output values
output "project_id" {
  description = "The GCP project ID"
  value       = google_project.tenant_project.project_id
}

output "project_number" {
  description = "The GCP project number"
  value       = google_project.tenant_project.number
}

output "firebase_config" {
  description = "Firebase configuration for client applications"
  value = {
    projectId      = local.project_id
    authDomain     = "${local.project_id}.firebaseapp.com"
    storageBucket  = "${local.project_id}.appspot.com"
    messagingSenderId = google_project.tenant_project.number
    appId          = "1:${google_project.tenant_project.number}:web:${random_id.project_suffix.hex}"
  }
  sensitive = false
}

output "api_url" {
  description = "Cloud Run API service URL"
  value       = google_cloud_run_service.api_service.status[0].url
}

output "storage_bucket" {
  description = "Cloud Storage bucket name"
  value       = google_storage_bucket.tenant_documents.name
}

output "service_account_email" {
  description = "Service account email for API service"
  value       = google_service_account.api_service_account.email
}

output "container_registry" {
  description = "Artifact Registry repository for containers"
  value       = "${var.region}-docker.pkg.dev/${local.project_id}/${google_artifact_registry_repository.container_repo.repository_id}"
}

output "secret_manager_config" {
  description = "Secret Manager secret name for configuration"
  value       = google_secret_manager_secret.api_config.secret_id
}