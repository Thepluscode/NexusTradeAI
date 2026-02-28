# ElastiCache Redis Module for NexusTradeAI
# High-performance Redis cluster optimized for trading applications

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# Random password for Redis auth token
resource "random_password" "auth_token" {
  count   = var.auth_token_enabled ? 1 : 0
  length  = 32
  special = false
}

# Security Group for ElastiCache
resource "aws_security_group" "redis" {
  name_prefix = "${var.cluster_id}-redis-"
  vpc_id      = var.vpc_id

  # Redis access from allowed CIDR blocks
  ingress {
    description = "Redis"
    from_port   = var.port
    to_port     = var.port
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  # Outbound traffic for replication
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-redis-sg"
    Type = "SecurityGroup"
  })
}

# Subnet Group for ElastiCache
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.cluster_id}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-subnet-group"
    Type = "ElastiCacheSubnetGroup"
  })
}

# Parameter Group for Redis optimization
resource "aws_elasticache_parameter_group" "main" {
  family = "redis7.x"
  name   = "${var.cluster_id}-params"

  # Performance optimizations for trading applications
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "60"
  }

  parameter {
    name  = "maxclients"
    value = "10000"
  }

  # Memory optimization
  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  # Persistence configuration
  parameter {
    name  = "save"
    value = "900 1 300 10 60 10000"
  }

  # Replication settings
  parameter {
    name  = "replica-read-only"
    value = "yes"
  }

  parameter {
    name  = "replica-serve-stale-data"
    value = "yes"
  }

  # Network optimization
  parameter {
    name  = "tcp-backlog"
    value = "511"
  }

  # Logging
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"  # 10ms
  }

  parameter {
    name  = "slowlog-max-len"
    value = "1000"
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-parameter-group"
    Type = "ElastiCacheParameterGroup"
  })
}

# ElastiCache Replication Group (Redis Cluster)
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = var.cluster_id
  description                = "Redis cluster for ${var.cluster_id}"

  # Node configuration
  node_type               = var.node_type
  port                   = var.port
  parameter_group_name   = aws_elasticache_parameter_group.main.name

  # Cluster configuration
  num_cache_clusters         = var.num_cache_clusters
  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled          = var.multi_az_enabled

  # Network configuration
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Engine configuration
  engine_version = var.engine_version

  # Backup configuration
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window         = var.snapshot_window
  maintenance_window      = var.maintenance_window

  # Security configuration
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled
  auth_token                 = var.auth_token_enabled ? random_password.auth_token[0].result : null

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  # Auto minor version upgrade
  auto_minor_version_upgrade = false

  # Apply changes immediately in non-production
  apply_immediately = var.apply_immediately

  tags = merge(var.tags, {
    Name = var.cluster_id
    Type = "ElastiCacheReplicationGroup"
  })

  depends_on = [
    aws_elasticache_subnet_group.main,
    aws_elasticache_parameter_group.main
  ]
}

# CloudWatch Log Group for Redis slow logs
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/redis/${var.cluster_id}/slow-log"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-slow-log"
    Type = "CloudWatchLogGroup"
  })
}

# Secrets Manager secret for Redis credentials
resource "aws_secretsmanager_secret" "redis_credentials" {
  count = var.auth_token_enabled ? 1 : 0

  name        = "${var.cluster_id}-redis-credentials"
  description = "Redis credentials for ${var.cluster_id}"

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-redis-credentials"
    Type = "Secret"
  })
}

resource "aws_secretsmanager_secret_version" "redis_credentials" {
  count = var.auth_token_enabled ? 1 : 0

  secret_id = aws_secretsmanager_secret.redis_credentials[0].id
  secret_string = jsonencode({
    auth_token = random_password.auth_token[0].result
    endpoint   = aws_elasticache_replication_group.main.configuration_endpoint_address
    port       = aws_elasticache_replication_group.main.port
  })
}

# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.cluster_id}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "120"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-cpu-alarm"
    Type = "CloudWatchAlarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.cluster_id}-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "120"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "This metric monitors Redis memory utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-memory-alarm"
    Type = "CloudWatchAlarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${var.cluster_id}-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "120"
  statistic           = "Average"
  threshold           = "8000"
  alarm_description   = "This metric monitors Redis connection count"
  alarm_actions       = var.alarm_actions

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-connections-alarm"
    Type = "CloudWatchAlarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "${var.cluster_id}-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "100"
  alarm_description   = "This metric monitors Redis evictions"
  alarm_actions       = var.alarm_actions

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-evictions-alarm"
    Type = "CloudWatchAlarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_replication_lag" {
  count = var.num_cache_clusters > 1 ? 1 : 0

  alarm_name          = "${var.cluster_id}-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ReplicationLag"
  namespace           = "AWS/ElastiCache"
  period              = "120"
  statistic           = "Average"
  threshold           = "5"
  alarm_description   = "This metric monitors Redis replication lag"
  alarm_actions       = var.alarm_actions

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-replication-lag-alarm"
    Type = "CloudWatchAlarm"
  })
}
