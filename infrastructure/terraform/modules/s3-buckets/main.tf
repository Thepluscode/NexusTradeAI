# S3 Buckets Module for NexusTradeAI
# Secure and optimized S3 storage for trading platform data

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# KMS Key for S3 encryption
resource "aws_kms_key" "s3" {
  description             = "S3 encryption key for ${var.project_name}-${var.environment}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-s3-kms"
    Type = "KMSKey"
  })
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${var.project_name}-${var.environment}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

# S3 Buckets
resource "aws_s3_bucket" "main" {
  for_each = var.buckets

  bucket = "${var.project_name}-${var.environment}-${each.key}"

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-${each.key}"
    Type        = "S3Bucket"
    Purpose     = each.key
    Environment = var.environment
  })
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "main" {
  for_each = var.buckets

  bucket = aws_s3_bucket.main[each.key].id
  versioning_configuration {
    status = each.value.versioning_enabled ? "Enabled" : "Disabled"
  }
}

# S3 Bucket Server-Side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  for_each = var.buckets

  bucket = aws_s3_bucket.main[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = each.value.encryption_enabled ? aws_kms_key.s3.arn : null
      sse_algorithm     = each.value.encryption_enabled ? "aws:kms" : "AES256"
    }
    bucket_key_enabled = each.value.encryption_enabled
  }
}

# S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "main" {
  for_each = var.buckets

  bucket = aws_s3_bucket.main[each.key].id

  block_public_acls       = each.value.public_access_blocked
  block_public_policy     = each.value.public_access_blocked
  ignore_public_acls      = each.value.public_access_blocked
  restrict_public_buckets = each.value.public_access_blocked
}

# S3 Bucket Lifecycle Configuration
resource "aws_s3_bucket_lifecycle_configuration" "main" {
  for_each = {
    for k, v in var.buckets : k => v if v.lifecycle_enabled
  }

  bucket = aws_s3_bucket.main[each.key].id

  rule {
    id     = "lifecycle_rule"
    status = "Enabled"

    # Transition to IA after 30 days
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Transition to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Transition to Deep Archive after 365 days
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    # Delete old versions after 90 days
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    # Delete incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    # Specific rules for different bucket types
    dynamic "expiration" {
      for_each = each.key == "logs" ? [1] : []
      content {
        days = 90  # Delete logs after 90 days
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.main]
}

# S3 Bucket Notification for critical buckets
resource "aws_s3_bucket_notification" "main" {
  for_each = {
    for k, v in var.buckets : k => v if contains(["data", "models", "backups"], k)
  }

  bucket = aws_s3_bucket.main[each.key].id

  # CloudWatch Events for object creation/deletion
  eventbridge = true
}

# S3 Bucket Logging
resource "aws_s3_bucket_logging" "main" {
  for_each = {
    for k, v in var.buckets : k => v if k != "logs"
  }

  bucket = aws_s3_bucket.main[each.key].id

  target_bucket = aws_s3_bucket.main["logs"].id
  target_prefix = "${each.key}/"
}

# S3 Bucket CORS Configuration for web access
resource "aws_s3_bucket_cors_configuration" "main" {
  for_each = {
    for k, v in var.buckets : k => v if contains(["data", "models"], k)
  }

  bucket = aws_s3_bucket.main[each.key].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# S3 Bucket Policy for secure access
resource "aws_s3_bucket_policy" "main" {
  for_each = var.buckets

  bucket = aws_s3_bucket.main[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureConnections"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.main[each.key].arn,
          "${aws_s3_bucket.main[each.key].arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "AllowVPCEndpointAccess"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.main[each.key].arn,
          "${aws_s3_bucket.main[each.key].arn}/*"
        ]
        Condition = {
          StringEquals = {
            "aws:SourceVpce" = var.vpc_endpoint_id
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.main]
}

# S3 Bucket Replication for critical data
resource "aws_s3_bucket_replication_configuration" "main" {
  for_each = {
    for k, v in var.buckets : k => v if contains(["data", "models", "backups"], k) && var.enable_cross_region_replication
  }

  role   = aws_iam_role.replication[0].arn
  bucket = aws_s3_bucket.main[each.key].id

  rule {
    id     = "replicate_all"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.replica[each.key].arn
      storage_class = "STANDARD_IA"

      encryption_configuration {
        replica_kms_key_id = aws_kms_key.s3_replica[0].arn
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.main]
}

# Replica buckets in different region
resource "aws_s3_bucket" "replica" {
  for_each = {
    for k, v in var.buckets : k => v if contains(["data", "models", "backups"], k) && var.enable_cross_region_replication
  }

  provider = aws.replica

  bucket = "${var.project_name}-${var.environment}-${each.key}-replica"

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-${each.key}-replica"
    Type        = "S3Bucket"
    Purpose     = "${each.key}-replica"
    Environment = var.environment
  })
}

# KMS Key for replica buckets
resource "aws_kms_key" "s3_replica" {
  count = var.enable_cross_region_replication ? 1 : 0

  provider = aws.replica

  description             = "S3 replica encryption key for ${var.project_name}-${var.environment}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-s3-replica-kms"
    Type = "KMSKey"
  })
}

# IAM Role for S3 Replication
resource "aws_iam_role" "replication" {
  count = var.enable_cross_region_replication ? 1 : 0

  name = "${var.project_name}-${var.environment}-s3-replication-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-s3-replication-role"
    Type = "IAMRole"
  })
}

# IAM Policy for S3 Replication
resource "aws_iam_role_policy" "replication" {
  count = var.enable_cross_region_replication ? 1 : 0

  name = "${var.project_name}-${var.environment}-s3-replication-policy"
  role = aws_iam_role.replication[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Effect = "Allow"
        Resource = [
          for bucket in aws_s3_bucket.main : "${bucket.arn}/*"
        ]
      },
      {
        Action = [
          "s3:ListBucket"
        ]
        Effect = "Allow"
        Resource = [
          for bucket in aws_s3_bucket.main : bucket.arn
        ]
      },
      {
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Effect = "Allow"
        Resource = [
          for bucket in aws_s3_bucket.replica : "${bucket.arn}/*"
        ]
      },
      {
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Effect = "Allow"
        Resource = [
          aws_kms_key.s3.arn,
          var.enable_cross_region_replication ? aws_kms_key.s3_replica[0].arn : ""
        ]
      }
    ]
  })
}
