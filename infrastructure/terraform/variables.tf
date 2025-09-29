# NexusTradeAI Infrastructure Variables
# Configuration variables for the trading platform infrastructure

# Project Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "nexustrade-ai"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development."
  }
}

# AWS Configuration
variable "aws_region" {
  description = "AWS region for infrastructure deployment"
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.aws_region))
    error_message = "AWS region must be a valid region identifier."
  }
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "default"
}

# Network Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "List of CIDR blocks that can access the EKS cluster endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Restrict this in production
}

# Kubernetes Configuration
variable "kubernetes_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"

  validation {
    condition     = can(regex("^1\\.(2[4-9]|[3-9][0-9])$", var.kubernetes_version))
    error_message = "Kubernetes version must be 1.24 or higher."
  }
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.r6g.2xlarge"  # High-performance for trading data
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS instance (GB)"
  type        = number
  default     = 1000

  validation {
    condition     = var.db_allocated_storage >= 100
    error_message = "Database storage must be at least 100 GB."
  }
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS auto-scaling (GB)"
  type        = number
  default     = 5000
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = var.db_backup_retention_period >= 7 && var.db_backup_retention_period <= 35
    error_message = "Backup retention period must be between 7 and 35 days."
  }
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = true
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.2xlarge"  # High-performance for real-time data
}

variable "redis_num_cache_clusters" {
  description = "Number of cache clusters in Redis replication group"
  type        = number
  default     = 3

  validation {
    condition     = var.redis_num_cache_clusters >= 2 && var.redis_num_cache_clusters <= 6
    error_message = "Redis clusters must be between 2 and 6."
  }
}

variable "redis_parameter_group_name" {
  description = "Redis parameter group name"
  type        = string
  default     = "default.redis7"
}

# Monitoring Configuration
variable "enable_monitoring" {
  description = "Enable comprehensive monitoring stack"
  type        = bool
  default     = true
}

variable "enable_logging" {
  description = "Enable centralized logging"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch retention period."
  }
}

# Security Configuration
variable "enable_encryption" {
  description = "Enable encryption at rest and in transit"
  type        = bool
  default     = true
}

variable "enable_waf" {
  description = "Enable AWS WAF for web application firewall"
  type        = bool
  default     = true
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for HTTPS"
  type        = string
  default     = ""
}

# Auto Scaling Configuration
variable "enable_cluster_autoscaler" {
  description = "Enable Kubernetes cluster autoscaler"
  type        = bool
  default     = true
}

variable "enable_horizontal_pod_autoscaler" {
  description = "Enable Horizontal Pod Autoscaler"
  type        = bool
  default     = true
}

variable "enable_vertical_pod_autoscaler" {
  description = "Enable Vertical Pod Autoscaler"
  type        = bool
  default     = true
}

# Backup Configuration
variable "enable_automated_backups" {
  description = "Enable automated backups for databases and persistent volumes"
  type        = bool
  default     = true
}

variable "backup_schedule" {
  description = "Cron schedule for automated backups"
  type        = string
  default     = "0 2 * * *"  # Daily at 2 AM UTC
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Enable spot instances for non-critical workloads"
  type        = bool
  default     = false  # Disabled for trading workloads requiring high availability
}

variable "enable_scheduled_scaling" {
  description = "Enable scheduled scaling for predictable workloads"
  type        = bool
  default     = true
}

# AI/ML Configuration
variable "enable_gpu_nodes" {
  description = "Enable GPU nodes for AI/ML workloads"
  type        = bool
  default     = true
}

variable "gpu_instance_types" {
  description = "List of GPU instance types for AI/ML workloads"
  type        = list(string)
  default     = ["p3.2xlarge", "p3.8xlarge"]
}

variable "ai_model_storage_size" {
  description = "Storage size for AI models (GB)"
  type        = number
  default     = 500
}

# Performance Configuration
variable "enable_enhanced_networking" {
  description = "Enable enhanced networking for high-performance instances"
  type        = bool
  default     = true
}

variable "enable_placement_groups" {
  description = "Enable placement groups for low-latency communication"
  type        = bool
  default     = true
}

# Compliance Configuration
variable "enable_compliance_monitoring" {
  description = "Enable compliance monitoring and auditing"
  type        = bool
  default     = true
}

variable "compliance_standards" {
  description = "List of compliance standards to adhere to"
  type        = list(string)
  default     = ["SOC2-Type2", "PCI-DSS", "ISO-27001"]
}

# Disaster Recovery Configuration
variable "enable_cross_region_backup" {
  description = "Enable cross-region backup for disaster recovery"
  type        = bool
  default     = true
}

variable "dr_region" {
  description = "Disaster recovery region"
  type        = string
  default     = "us-west-2"
}

# Resource Tagging
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Feature Flags
variable "feature_flags" {
  description = "Feature flags for enabling/disabling specific features"
  type = object({
    enable_service_mesh     = bool
    enable_chaos_engineering = bool
    enable_canary_deployments = bool
    enable_blue_green_deployments = bool
  })
  default = {
    enable_service_mesh     = true
    enable_chaos_engineering = false
    enable_canary_deployments = true
    enable_blue_green_deployments = true
  }
}