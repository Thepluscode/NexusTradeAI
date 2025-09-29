# NexusTradeAI Infrastructure - Main Terraform Configuration
# High-performance trading platform infrastructure on AWS

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
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state backend
  backend "s3" {
    bucket         = "nexustrade-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "nexustrade-terraform-locks"

    # Versioning and backup
    versioning = true
  }
}

# Configure AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "NexusTradeAI"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "DevOps"
      CostCenter  = "TradingPlatform"
      Compliance  = "SOC2-Type2"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Local values
locals {
  cluster_name = "${var.project_name}-${var.environment}"

  # Network configuration
  vpc_cidr = var.vpc_cidr
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)

  # Subnet CIDRs
  private_subnets = [
    cidrsubnet(local.vpc_cidr, 8, 1),
    cidrsubnet(local.vpc_cidr, 8, 2),
    cidrsubnet(local.vpc_cidr, 8, 3)
  ]

  public_subnets = [
    cidrsubnet(local.vpc_cidr, 8, 101),
    cidrsubnet(local.vpc_cidr, 8, 102),
    cidrsubnet(local.vpc_cidr, 8, 103)
  ]

  database_subnets = [
    cidrsubnet(local.vpc_cidr, 8, 201),
    cidrsubnet(local.vpc_cidr, 8, 202),
    cidrsubnet(local.vpc_cidr, 8, 203)
  ]

  # Common tags
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "DevOps"
  }
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc-networking"

  name = local.cluster_name
  cidr = local.vpc_cidr

  azs              = local.azs
  private_subnets  = local.private_subnets
  public_subnets   = local.public_subnets
  database_subnets = local.database_subnets

  # NAT Gateway configuration
  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  # DNS configuration
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  flow_log_max_aggregation_interval    = 60

  # VPC Endpoints for cost optimization
  enable_s3_endpoint       = true
  enable_dynamodb_endpoint = true

  tags = local.common_tags
}

# EKS Cluster
module "eks" {
  source = "./modules/eks-cluster"

  cluster_name    = local.cluster_name
  cluster_version = var.kubernetes_version

  vpc_id                   = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  # Cluster endpoint configuration
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true
  cluster_endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs

  # Cluster logging
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  # Cluster encryption
  cluster_encryption_config = [
    {
      provider_key_arn = module.kms.key_arn
      resources        = ["secrets"]
    }
  ]

  # Node groups
  node_groups = {
    # General purpose nodes
    general = {
      desired_capacity = 3
      max_capacity     = 10
      min_capacity     = 3

      instance_types = ["m5.2xlarge"]
      capacity_type  = "ON_DEMAND"

      k8s_labels = {
        Environment = var.environment
        NodeGroup   = "general"
      }

      additional_tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
      }
    }

    # High-performance trading nodes
    trading = {
      desired_capacity = 2
      max_capacity     = 8
      min_capacity     = 2

      instance_types = ["c5n.4xlarge"]  # High network performance
      capacity_type  = "ON_DEMAND"

      k8s_labels = {
        Environment = var.environment
        NodeGroup   = "trading"
        WorkloadType = "high-performance"
      }

      taints = [
        {
          key    = "trading-workload"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
    }

    # GPU nodes for AI/ML workloads
    gpu = {
      desired_capacity = 1
      max_capacity     = 5
      min_capacity     = 0

      instance_types = ["p3.2xlarge"]
      capacity_type  = "ON_DEMAND"

      k8s_labels = {
        Environment = var.environment
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
    }
  }

  tags = local.common_tags
}