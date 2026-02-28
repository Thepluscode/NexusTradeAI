# NexusTradeAI Production Environment
# High-performance trading platform production infrastructure

terraform {
  required_version = ">= 1.5"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
  
  # Remote state backend for production
  backend "s3" {
    bucket         = "nexustrade-terraform-state-prod"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "nexustrade-terraform-locks-prod"
    
    # Versioning and backup
    versioning = true
  }
}

# Configure AWS Provider for Production
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "NexusTradeAI"
      Environment = "production"
      ManagedBy   = "Terraform"
      Owner       = "DevOps"
      CostCenter  = "TradingPlatform"
      Compliance  = "SOC2-Type2,PCI-DSS"
      Backup      = "Required"
      Monitoring  = "Critical"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Local values for production
locals {
  cluster_name = "nexustrade-ai-production"
  environment  = "production"
  
  # Network configuration for production
  vpc_cidr = "10.0.0.0/16"
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)
  
  # Subnet CIDRs for production
  private_subnets = [
    "10.0.1.0/24",
    "10.0.2.0/24",
    "10.0.3.0/24"
  ]
  
  public_subnets = [
    "10.0.101.0/24",
    "10.0.102.0/24",
    "10.0.103.0/24"
  ]
  
  database_subnets = [
    "10.0.201.0/24",
    "10.0.202.0/24",
    "10.0.203.0/24"
  ]
  
  # Production tags
  common_tags = {
    Project     = "NexusTradeAI"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Owner       = "DevOps"
    CostCenter  = "TradingPlatform"
  }
}

# VPC and Networking for Production
module "vpc" {
  source = "../../modules/vpc-networking"
  
  name = local.cluster_name
  cidr = local.vpc_cidr
  
  azs              = local.azs
  private_subnets  = local.private_subnets
  public_subnets   = local.public_subnets
  database_subnets = local.database_subnets
  
  # Production NAT Gateway configuration
  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true
  
  # DNS configuration
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  # VPC Flow Logs for security
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  flow_log_max_aggregation_interval    = 60
  
  # VPC Endpoints for cost optimization
  enable_s3_endpoint       = true
  enable_dynamodb_endpoint = true
  
  tags = local.common_tags
}

# EKS Cluster for Production
module "eks" {
  source = "../../modules/eks-cluster"
  
  cluster_name    = local.cluster_name
  cluster_version = "1.28"
  
  vpc_id                   = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets
  
  # Production endpoint configuration
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true
  cluster_endpoint_public_access_cidrs = [
    "0.0.0.0/0"  # Restrict this to your office/VPN IPs in production
  ]
  
  # Comprehensive logging for production
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]
  
  # Production node groups
  node_groups = {
    # General purpose nodes for standard workloads
    general = {
      desired_capacity = 6
      max_capacity     = 20
      min_capacity     = 6
      
      instance_types = ["m5.2xlarge"]
      capacity_type  = "ON_DEMAND"
      
      k8s_labels = {
        Environment = "production"
        NodeGroup   = "general"
        WorkloadType = "standard"
      }
      
      taints = []
      
      additional_tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
        "NodeGroup" = "general"
      }
    }
    
    # High-performance trading nodes
    trading = {
      desired_capacity = 4
      max_capacity     = 12
      min_capacity     = 4
      
      instance_types = ["c5n.4xlarge"]  # High network performance
      capacity_type  = "ON_DEMAND"
      
      k8s_labels = {
        Environment = "production"
        NodeGroup   = "trading"
        WorkloadType = "high-performance"
        "node-type" = "trading-optimized"
      }
      
      taints = [
        {
          key    = "trading-workload"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
      
      additional_tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
        "NodeGroup" = "trading"
        "Performance" = "high"
      }
    }
    
    # GPU nodes for AI/ML workloads
    gpu = {
      desired_capacity = 2
      max_capacity     = 8
      min_capacity     = 1
      
      instance_types = ["p3.2xlarge"]
      capacity_type  = "ON_DEMAND"
      
      k8s_labels = {
        Environment = "production"
        NodeGroup   = "gpu"
        WorkloadType = "ai-ml"
        "node-type" = "gpu-optimized"
        "instance-type" = "p3.2xlarge"
      }
      
      taints = [
        {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
      
      additional_tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
        "NodeGroup" = "gpu"
        "GPU" = "enabled"
      }
    }
    
    # Memory-optimized nodes for databases and caching
    memory = {
      desired_capacity = 3
      max_capacity     = 9
      min_capacity     = 3
      
      instance_types = ["r5.2xlarge"]
      capacity_type  = "ON_DEMAND"
      
      k8s_labels = {
        Environment = "production"
        NodeGroup   = "memory"
        WorkloadType = "memory-intensive"
        "node-type" = "memory-optimized"
      }
      
      taints = [
        {
          key    = "memory-workload"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
      
      additional_tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
        "NodeGroup" = "memory"
        "Memory" = "optimized"
      }
    }
  }
  
  tags = local.common_tags
}

# RDS PostgreSQL for Production
module "rds_primary" {
  source = "../../modules/rds-databases"
  
  identifier = "${local.cluster_name}-primary"
  
  # Production database configuration
  engine_version = "14.9"
  instance_class = "db.r6g.4xlarge"  # High-performance for trading
  
  # Storage configuration for production
  allocated_storage     = 2000  # 2TB initial
  max_allocated_storage = 10000 # 10TB max auto-scaling
  iops                 = 12000  # High IOPS for trading
  storage_throughput   = 500    # High throughput
  
  # Database configuration
  database_name   = "nexustrade_production"
  master_username = "nexustrade_admin"
  
  # Network configuration
  vpc_id                = module.vpc.vpc_id
  db_subnet_group_name  = module.vpc.database_subnet_group_name
  allowed_cidr_blocks   = module.vpc.private_subnets_cidr_blocks
  
  # High availability for production
  multi_az = true
  
  # Backup configuration for production
  backup_retention_period = 30  # 30 days retention
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  # Read replicas for production
  create_read_replica        = true
  read_replica_count         = 2
  read_replica_instance_class = "db.r6g.2xlarge"
  
  # Security for production
  deletion_protection = true
  skip_final_snapshot = false
  apply_immediately   = false
  
  # Monitoring
  alarm_actions = []  # Add SNS topic ARNs for alerts
  
  tags = local.common_tags
}

# ElastiCache Redis for Production
module "elasticache" {
  source = "../../modules/elasticache"
  
  cluster_id = "${local.cluster_name}-redis"
  
  # Production Redis configuration
  node_type               = "cache.r6g.2xlarge"
  num_cache_clusters      = 3
  parameter_group_name    = "default.redis7"
  port                   = 6379
  
  # Network configuration
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets
  allowed_cidr_blocks = module.vpc.private_subnets_cidr_blocks
  
  # High availability
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  # Backup configuration
  snapshot_retention_limit = 7
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:07:00"
  
  # Security
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true
  
  tags = local.common_tags
}

# S3 Buckets for Production
module "s3_buckets" {
  source = "../../modules/s3-buckets"
  
  project_name = "nexustrade-ai"
  environment  = "production"
  
  # Production bucket configuration
  buckets = {
    data = {
      versioning_enabled = true
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
    }
    
    models = {
      versioning_enabled = true
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
    }
    
    backups = {
      versioning_enabled = true
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
    }
    
    logs = {
      versioning_enabled = false
      lifecycle_enabled  = true
      encryption_enabled = true
      public_access_blocked = true
    }
  }
  
  tags = local.common_tags
}

# Output important values
output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "database_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds_primary.db_instance_endpoint
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.elasticache.redis_endpoint
}
